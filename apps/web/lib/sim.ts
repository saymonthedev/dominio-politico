/**
 * Ponte entre o motor (@dp/engine) e o banco. Só roda no servidor.
 * O motor decide o que acontece; aqui só carregamos estado, avançamos o
 * relógio do mundo, aplicamos ações e gravamos as mudanças.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadBairros, loadCities, loadSnapshot } from "@dp/data";
import { liveVitals, type LiveVitals } from "./vitals";
import {
  careerSummary,
  electionNight,
  Changes,
  clearPlayerData,
  createInitialWorld,
  brasiliaHour,
  clockPace,
  clockTarget,
  pendingFor,
  PRIVATE_FLAG,
  resolveStory,
  stepDays,
  SHARED_SPEED,
  Ctx,
  DEFAULT_RULESET,
  housingFromFile,
  type CityHousing,
  emptyTables,
  FICTIONAL_FLAG,
  fictionalizeCities,
  fictionalizeWorld,
  hydrateState,
  runTicks,
  STATEFUL_TABLES,
  START_YEARS,
  targetTick,
  type Apuracao,
  type CityBase,
  type CareerSummary,
  type DayDigest,
  type EconomyRow,
  type StoryDelta,
  type DayFault,
  type StatefulTable,
  type StoryEvent,
  type WorldRow,
  type WorldState,
} from "@dp/engine";
import { after } from "next/server";
import { simSecret, SUPABASE_KEY, SUPABASE_URL } from "./env";
import { dropSnapshot, readSnapshot, SNAPSHOTS, snapshotNewerThan, writeSnapshot } from "./snapshot";
import { reportError } from "./report-error";

export const WORLD_VERSION = "v1";
/** Compartilhado (todos jogam juntos), só do jogador com dados reais, ou só do jogador e fictício. */
export type WorldMode = "SHARED" | "PRIVATE" | "FICTIONAL";
export const WORLD_MODES: readonly WorldMode[] = ["SHARED", "PRIVATE", "FICTIONAL"];

/** br2026 (compartilhado), br2026p<conta> (só meu) ou br2026f<conta> (fictício). */
export function worldIdFor(year: number, mode: WorldMode = "SHARED", userId?: string): string {
  if (mode === "SHARED" || !userId) return `br${year}`;
  return `br${year}${mode === "FICTIONAL" ? "f" : "p"}${userId.replace(/-/g, "").slice(0, 10).toLowerCase()}`;
}
export const yearOfWorld = (id: string) => Number(id.slice(2, 6));
export const modeOfWorld = (id: string): WorldMode => (id[6] === "f" ? "FICTIONAL" : id[6] === "p" ? "PRIVATE" : "SHARED");
/** Quantos mundos próprios cabem no banco (cada um ocupa alguns MB). */
export const MAX_PRIVATE_WORLDS = Number(process.env.MAX_PRIVATE_WORLDS ?? "30");
export const isStartYear = (y: number): boolean => (START_YEARS as readonly number[]).includes(y);

const MAX_CATCHUP = Number(process.env.WORLD_MAX_CATCHUP_TICKS ?? "45");
const CHUNK_ROWS = 500;
/** lotes gravados ao mesmo tempo (as tabelas do mundo não têm chaves estrangeiras entre si) */
const PARALLEL_BATCHES = 3;

/**
 * Token do jogador da requisição. Com ele o banco usa o papel autenticado,
 * que tem 8 s por comando; sem ele (cron), o anônimo, com 3 s.
 */
const playerToken = new AsyncLocalStorage<string>();

/** Executa `fn` com as chamadas ao banco no papel do jogador logado. */
export function asPlayer<T>(token: string | null | undefined, fn: () => Promise<T>): Promise<T> {
  return token ? playerToken.run(token, fn) : fn();
}

let anonClient: SupabaseClient | null = null;

function db(token?: string): SupabaseClient {
  const auth = { persistSession: false, autoRefreshToken: false };
  if (!token) return (anonClient ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth }));
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth, global: { headers: { Authorization: `Bearer ${token}` } } });
}

export class SimDbError extends Error {
  constructor(
    fn: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`${fn}: ${message}`);
  }
}

const isTimeout = (e: unknown) => e instanceof SimDbError && (e.code === "57014" || /statement timeout/i.test(e.message));

async function rpc<T>(fn: string, args: Record<string, unknown>, opts: { retries?: number } = {}): Promise<T> {
  const token = playerToken.getStore();
  const call = (t?: string) => db(t).rpc(fn, { p_secret: simSecret(), ...args });
  let { data, error } = await call(token);
  // token vencido ou recusado: segue no papel anônimo
  if (error && token && (/^PGRST3/.test(error.code ?? "") || /jwt/i.test(error.message))) ({ data, error } = await call());
  // banco num pico de carga: tenta de novo (leituras e gravações do motor são idempotentes), com
  // espera crescente e sorteada, para as novas tentativas de vários servidores não chegarem juntas
  const retries = opts.retries ?? 2;
  for (let i = 0; error && i < retries && (error.code === "57014" || /statement timeout/i.test(error.message)); i++) {
    await new Promise((ok) => setTimeout(ok, 600 * (i + 1) + Math.random() * 900));
    ({ data, error } = await call(token));
  }
  if (error) throw new SimDbError(fn, error.code, error.message);
  return data as T;
}

/** Se o mundo existe (os próprios não aparecem na leitura pública, por isso a função do banco). */
export async function worldExists(worldId: string): Promise<boolean> {
  const { data, error } = await db().rpc("world_exists", { p_world: worldId });
  if (error) throw new SimDbError("world_exists", error.code, error.message);
  return !!data;
}

/** Quantos mundos próprios existem hoje. */
export async function countPrivateWorlds(): Promise<number> {
  const { data, error } = await db().rpc("private_world_count");
  if (error) throw new SimDbError("private_world_count", error.code, error.message);
  return Number(data ?? 0);
}

/**
 * Remove um mundo próprio inteiro (o banco recusa os compartilhados). Sai aos pedaços, cada
 * chamada bem abaixo do limite de tempo do banco; se faltar um resto, a tarefa do banco termina.
 */
export async function dropWorld(worldId: string): Promise<void> {
  if (modeOfWorld(worldId) === "SHARED") return;
  try {
    for (let i = 0; i < 40; i++) if (await rpc<boolean>("sim_drop_world_step", { p_world: worldId })) break;
  } catch (e) {
    // banco ainda sem a remoção aos pedaços: a função antiga, de uma vez
    if (!missingFn(e)) throw e;
    await rpc("sim_drop_world", { p_world: worldId });
  }
  // a revisão salta: um mundo recriado com o mesmo id nunca reaproveita uma memória antiga
  await bumpWorldRev(worldId, 1_000_000).catch(() => undefined);
  await dropSnapshot(worldId);
  fictionCities.delete(worldId);
}

const cityCache = new Map<number, Promise<Map<string, CityBase>>>();

/** Bairros reais (IBGE) de todas as cidades: estáticos, carregados uma vez por instância. */
let housingCache: Promise<Map<string, CityHousing>> | null = null;
export function housingData(): Promise<Map<string, CityHousing>> {
  housingCache ??= loadBairros().then(housingFromFile);
  return housingCache;
}

/** Municípios reais do ponto de partida (estáticos; carregados uma vez por instância). */
export function citiesFor(year: number): Promise<Map<string, CityBase>> {
  if (!cityCache.has(year)) cityCache.set(year, loadCities(year).then((list) => new Map(list.map((c) => [c.id, c]))));
  return cityCache.get(year)!;
}

type Batch = Record<string, unknown[]>;

const rowsIn = (b: Batch) => Object.values(b).reduce((s, rows) => s + rows.length, 0);

function halves(b: Batch): [Batch, Batch] {
  const flat = Object.entries(b).flatMap(([table, rows]) => rows.map((row) => [table, row] as const));
  const pack = (part: typeof flat) => {
    const out: Batch = {};
    for (const [table, row] of part) (out[table] ??= []).push(row);
    return out;
  };
  const mid = Math.ceil(flat.length / 2);
  return [pack(flat.slice(0, mid)), pack(flat.slice(mid))];
}

/**
 * Grava um lote (sim_apply: upsert; sim_fill: só insere o que falta); se estourar o tempo do banco,
 * divide ao meio e tenta de novo (as duas gravações são idempotentes).
 */
async function applyBatch(worldId: string, batch: Batch, fn: "sim_apply" | "sim_fill" = "sim_apply"): Promise<void> {
  try {
    await rpc(fn, fn === "sim_apply" ? { p_world: worldId, p_changes: batch, p_expected_tick: null } : { p_world: worldId, p_changes: batch });
  } catch (e) {
    if (!isTimeout(e) || rowsIn(batch) < 2) throw e;
    const [a, b] = halves(batch);
    await applyBatch(worldId, a, fn);
    await applyBatch(worldId, b, fn);
  }
}

/** Divide as mudanças em lotes de até CHUNK_ROWS linhas. */
function batchesOf(json: Record<string, unknown[]>): Batch[] {
  const batches: Batch[] = [];
  let batch: Batch = {};
  let count = 0;
  for (const [table, rows] of Object.entries(json)) {
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      const slice = rows.slice(i, i + CHUNK_ROWS);
      if (count + slice.length > CHUNK_ROWS) {
        batches.push(batch);
        batch = {};
        count = 0;
      }
      batch[table] = [...(batch[table] ?? []), ...slice];
      count += slice.length;
    }
  }
  if (count) batches.push(batch);
  return batches;
}

/** Grava os lotes com alguns em paralelo; espera todos antes de falhar (nada fica gravando depois). */
async function writeBatches(worldId: string, batches: Batch[], fn: "sim_apply" | "sim_fill"): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, async () => {
    while (next < batches.length) await applyBatch(worldId, batches[next++], fn);
  });
  const failed = (await Promise.allSettled(workers)).find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
}

/** Eventos que contam a história do jogador (a Carreira e a limpeza de mundos parados leem). */
const PLAYER_EVENT_TYPES = new Set(["PLAYER_ACTION", "TIME_ADVANCED", "CHARACTER_CREATED", "PLAYER_RETIREMENT"]);

/**
 * Só vão para o banco os eventos que alguma tela lê: os que envolvem um jogador. Os internos do
 * motor (etapas de investigação, crimes e saídas de partido entre NPCs, Copom...) eram a maior
 * tabela do banco e ninguém os lia; as notícias e o estado do mundo continuam com tudo.
 */
function keepPlayerEvents(json: Record<string, unknown[]>, state: WorldState): void {
  const events = json.world_events as Array<{ type: string; actors?: string[] | null }> | undefined;
  if (!events?.length) return;
  const players = new Set<string>();
  for (const p of state.t.persons.values()) if (p.kind === "PLAYER") players.add(p.id);
  const kept = events.filter((e) => PLAYER_EVENT_TYPES.has(e.type) || (e.actors ?? []).some((id) => players.has(id)));
  if (kept.length) json.world_events = kept;
  else delete json.world_events;
}

/** Grava as mudanças em lotes paralelos; a linha do mundo vai por último, com checagem de tick. */
export async function persist(worldId: string, changes: Changes, expectedTick: number | null, state?: WorldState): Promise<void> {
  const json = changes.toJSON();
  const worldRows = json.worlds ?? [];
  delete json.worlds;
  if (state) keepPlayerEvents(json, state);
  await writeBatches(worldId, batchesOf(json), "sim_apply");
  if (worldRows.length) {
    await rpc("sim_apply", { p_world: worldId, p_changes: { worlds: worldRows }, p_expected_tick: expectedTick });
  }
}

/** Criação marcada há mais que isto (segundos) foi interrompida e pode ser retomada. */
const BUILD_STALE_S = 45;

/** null: mundo não existe; 0: pronto; senão, a hora (epoch, s) em que a criação começou. */
async function worldBuilding(worldId: string): Promise<number | null> {
  try {
    return asRev(await rpc<number | null>("sim_world_building", { p_world: worldId }));
  } catch (e) {
    // banco sem a função (migração por aplicar): vale o jeito antigo
    if (missingFn(e)) return (await worldExists(worldId)) ? 0 : null;
    throw e;
  }
}

/**
 * Cria o mundo de um ponto de partida (idempotente: a semente é fixa por mundo).
 * Mundos próprios têm o relógio parado (só andam quando o dono avança) e,
 * no modo fictício, nomes inventados para todas as pessoas e partidos.
 *
 * A linha do mundo nasce marcada como "em construção" e só perde a marca no fim.
 * Se a criação foi interrompida (limite de tempo, banco sobrecarregado), a próxima
 * chamada a retoma: gera de novo o mesmo mundo e insere só as linhas que faltam,
 * sem tocar no que já existe (nem no que o jogador já fez).
 */
export async function ensureWorld(year: number, worldId = worldIdFor(year)): Promise<void> {
  if (!isStartYear(year) || yearOfWorld(worldId) !== year) throw new Error("Ponto de partida inválido");
  const building = await worldBuilding(worldId);
  if (building === 0) return;
  // o mundo anterior com este id ainda está saindo (remoção aos pedaços): espera terminar
  if (building === -1) throw new Error("O mundo anterior ainda está sendo apagado. Tente de novo em 1 minuto.");
  // outra requisição está criando este mundo agora mesmo
  if (building !== null && Date.now() / 1000 - building < BUILD_STALE_S) return;
  const mode = modeOfWorld(worldId);
  const snap = await loadSnapshot(year);
  const cities = await citiesFor(year);
  const base = `dominio-politico-${year}-${WORLD_VERSION}`;
  const { state, changes } = createInitialWorld(snap, {
    cities: [...cities.values()],
    worldId,
    seed: mode === "SHARED" ? base : `${base}|${worldId}`,
    startRealAt: new Date().toISOString(),
    gameDaysPerRealHour: mode === "SHARED" ? SHARED_SPEED : 0,
    name: mode === "SHARED" ? `Brasil pós-${year}` : `Brasil pós-${year} · só seu`,
  });
  if (mode !== "SHARED") state.world.stats[PRIVATE_FLAG] = 1;
  if (mode === "FICTIONAL") fictionalizeWorld(state, changes);
  changes.rows.delete("worlds");
  if (building === null) {
    // um mundo próprio apagado e criado de novo com o mesmo id não pode herdar a cópia do antigo
    await dropSnapshot(worldId);
    // linha do mundo primeiro (com start_year e a marca de construção) para as próximas leituras;
    // born_at fica para sempre e distingue este mundo de um anterior com o mesmo id
    const now = Math.floor(Date.now() / 1000);
    const worldRow = { ...state.world, start_year: year, stats: { ...state.world.stats, building: now, born_at: now } };
    await rpc("sim_apply", { p_world: worldId, p_changes: { worlds: [worldRow] }, p_expected_tick: null });
    await writeBatches(worldId, batchesOf(changes.toJSON()), "sim_apply");
  } else {
    // retomada: só o que falta (a linha do mundo e o que já existe ficam como estão)
    await writeBatches(worldId, batchesOf(changes.toJSON()), "sim_fill");
  }
  await rpc("sim_world_ready", { p_world: worldId }).catch((e) => {
    if (!missingFn(e)) throw e;
  });
  // quem leu o mundo pela metade, durante a criação, recarrega inteiro
  await bumpWorldRev(worldId).catch(() => undefined);
}

type LoadedJson = Record<string, unknown[]> & { world: WorldRow; economy: EconomyRow };

const LOAD_PARTS = ["core", "persons", "person_states", "parties", "elections", "mandates", "crime"] as const;

/** A função não existe no banco (migração ainda não aplicada). */
const missingFn = (e: unknown) => e instanceof SimDbError && (e.code === "PGRST202" || /could not find the function|schema cache/i.test(e.message));

/** sem sim_world_part no banco: usa as funções antigas até a migração chegar */
let legacyParts = false;

/**
 * Busca o mundo em partes paralelas (cada uma bem abaixo do limite de tempo do banco). O banco monta
 * JSON direto (sim_world_part), bem mais barato que o formato antigo (sim_load_part), que fica de reserva.
 */
async function fetchWorld(worldId: string): Promise<LoadedJson | null> {
  // leitura pesada: no máximo uma nova tentativa (repetir várias vezes só afunda um banco sobrecarregado)
  // e poucas partes ao mesmo tempo por instância (várias cargas juntas derrubavam o banco inteiro)
  const parts = (fn: string) =>
    Promise.all(LOAD_PARTS.map((part) => heavy(() => rpc<Record<string, unknown> | null>(fn, { p_world: worldId, p_part: part }, { retries: 1 }))));
  let got: Array<Record<string, unknown> | null>;
  try {
    got = await parts(legacyParts ? "sim_load_part" : "sim_world_part");
  } catch (e) {
    if (legacyParts || !missingFn(e)) throw e;
    legacyParts = true;
    got = await parts("sim_load_part");
  }
  if (got.some((x) => !x)) return null;
  return Object.assign({}, ...got) as LoadedJson;
}

export async function loadState(worldId: string): Promise<WorldState> {
  const data = await fetchWorld(worldId);
  if (!data) throw new Error("Mundo não encontrado");
  return stateFrom(worldId, data);
}

/** Monta o estado a partir das linhas do mundo (lidas do banco ou da cópia guardada). */
async function stateFrom(worldId: string, data: LoadedJson): Promise<WorldState> {
  if (data.world.stats?.dropping) throw new Error("Este mundo foi apagado.");
  const t = emptyTables();
  for (const name of STATEFUL_TABLES) {
    const map = t[name] as Map<string, unknown>;
    for (const row of (data[name] ?? []) as Array<{ id: string }>) map.set(row.id, row);
  }
  let cities = await citiesFor(yearOfWorld(worldId));
  if (data.world.stats?.[FICTIONAL_FLAG]) {
    if (!fictionCities.has(worldId)) fictionCities.set(worldId, fictionalizeCities(cities, { world: data.world, t }));
    cities = fictionCities.get(worldId)!;
  }
  return hydrateState({ world: data.world, economy: data.economy, ruleset: DEFAULT_RULESET, t, cities, housing: await housingData() });
}

/** Municípios já convertidos para os nomes de cada mundo fictício. */
const fictionCities = new Map<string, Map<string, CityBase>>();

/* ---------- atualização incremental: só o que mudou desde a revisão em memória ---------- */

/** O que mudou no mundo depois de uma revisão (sim_world_delta). */
interface DeltaJson {
  rev: number;
  /** o registro de mudanças não cobre o intervalo: só recarregando tudo */
  full: boolean;
  world?: WorldRow;
  economy?: EconomyRow | null;
  tables?: Partial<Record<StatefulTable, Array<{ id: string }>>>;
}

/** Mudanças desde a revisão `since`. Sem a função no banco (migração por aplicar), pede a carga completa. */
async function fetchDelta(worldId: string, since: number): Promise<DeltaJson | null> {
  try {
    return await rpc<DeltaJson | null>("sim_world_delta", { p_world: worldId, p_since: since }, { retries: 1 });
  } catch (e) {
    if (missingFn(e)) return { rev: since, full: true };
    throw e;
  }
}

/** Data ISO `years` anos antes (29/2 vira 28/2, como no banco). */
function yearsBefore(d: string, years: number): string {
  const md = d.slice(5, 10) === "02-29" ? "02-28" : d.slice(5, 10);
  return `${String(Number(d.slice(0, 4)) - years).padStart(4, "0")}-${md}`;
}

/**
 * As mesmas regras da carga completa (sim_world_part) para o que fica na memória:
 * quem mantém o mundo por atualizações incrementais termina com o mesmo estado de
 * quem acabou de carregá-lo inteiro (e a memória não cresce com o tempo).
 */
export function trimToLoad(state: WorldState): void {
  const t = state.t;
  const keep = <V>(m: Map<string, V>, ok: (v: V) => boolean) => {
    for (const [id, v] of m) if (!ok(v)) m.delete(id);
  };
  keep(t.persons, (p) => p.status === "ACTIVE" || p.kind === "PLAYER");
  keep(t.person_states, (s) => t.persons.has(s.id));
  keep(t.memberships, (m) => m.status === "ATIVA");
  keep(t.affiliation_requests, (r) => r.status === "PENDENTE");
  const open = new Set<string>();
  for (const e of t.elections.values()) if (e.status !== "ENCERRADA") open.add(e.id);
  keep(t.races, (r) => open.has(r.election_id));
  keep(t.candidacies, (c) => open.has(c.election_id));
  keep(t.debates, (d) => d.status === "AGENDADO" || d.status === "AO_VIVO");
  const mandFloor = yearsBefore(state.world.game_date, 9);
  keep(t.mandates, (m) => m.status === "ATIVO" || m.status === "FUTURO" || (!!m.end_on && m.end_on > mandFloor));
  keep(t.bills, (b) => b.status === "TRAMITANDO");
  keep(t.policies, (p) => p.status === "EM_ANDAMENTO" || p.status === "ATRASADA");
  keep(t.rumors, (r) => r.status === "ATIVO");
  const actFloor = yearsBefore(state.world.game_date, 6);
  keep(t.illicit_acts, (a) => !a.discovered || a.created_on > actFloor);
  keep(t.investigations, (i) => i.outcome == null);
}

/** Aplica no estado em memória as linhas que mudaram no banco. */
export function applyDelta(state: WorldState, d: DeltaJson): void {
  if (d.world) state.world = d.world;
  if (d.economy) state.economy = d.economy;
  for (const [name, rows] of Object.entries(d.tables ?? {})) {
    const map = state.t[name as StatefulTable] as Map<string, unknown> | undefined;
    if (!map || !rows) continue;
    for (const row of rows) map.set(row.id, row);
  }
  hydrateState(state);
  trimToLoad(state);
}

/** Mundo em memória: o estado e a revisão do banco em que ele está. */
interface Cached {
  state: WorldState;
  /** quando foi lido inteiro do banco (depois de CACHE_MAX_MS, é relido inteiro) */
  born: number;
  rev: number | null;
  /** este servidor está gravando o mundo agora (com o lease): a memória está à frente do banco */
  writing: boolean;
}
const cache = new Map<string, Cached>();
const loading = new Map<string, Promise<Cached>>();
/** uma busca de mudanças por vez para cada memória */
const syncing = new WeakMap<Cached, Promise<SyncResult>>();
/** sem revisão conhecida (o banco não respondeu), a memória vale por pouco tempo */
const CACHE_MS = 8_000;
/** com as atualizações incrementais a memória dura; de tempos em tempos é relida inteira */
const CACHE_MAX_MS = 6 * 60 * 60_000;
/**
 * Mundos guardados por instância (o menos usado sai primeiro). Cada carga completa custa ~10 s de
 * banco; com 4 vagas e dezenas de mundos próprios ativos, a memória girava e o banco recarregava
 * mundos o tempo todo. O teto de memória tira os mais antigos antes de a instância apertar.
 */
const CACHE_WORLDS = Number(process.env.WORLD_CACHE_MAX ?? "12");
/** no servidor próprio (bem mais memória) os dois sobem pelo ambiente: WORLD_CACHE_MAX e WORLD_CACHE_HEAP_MB */
const CACHE_HEAP_MAX = Number(process.env.WORLD_CACHE_HEAP_MB ?? "1100") * 1024 * 1024;

function remember(worldId: string, entry: Cached): void {
  cache.delete(worldId);
  cache.set(worldId, entry);
  while (cache.size > CACHE_WORLDS) cache.delete(cache.keys().next().value as string);
  // memória apertada: solta os menos usados (nunca o que acabou de entrar nem um que está gravando)
  for (const [id, e] of cache) {
    if (cache.size <= 2 || process.memoryUsage().heapUsed < CACHE_HEAP_MAX) break;
    if (id !== worldId && !e.writing) cache.delete(id);
  }
}

/* ---------- cópia do mundo fora do banco (lib/snapshot.ts) ---------- */

/** As linhas do mundo, no mesmo formato da carga completa do banco. */
function snapshotData(state: WorldState): LoadedJson {
  const out: Record<string, unknown> = { world: state.world, economy: state.economy };
  for (const name of STATEFUL_TABLES) out[name] = [...(state.t[name] as Map<string, unknown>).values()];
  return out as LoadedJson;
}

/**
 * O mundo a partir da cópia guardada e do que mudou no banco depois dela. null quando não há cópia
 * que sirva: velha demais para o registro de mudanças, de outro mundo com o mesmo id, ou ilegível.
 */
async function fromSnapshot(worldId: string, rev: number): Promise<{ state: WorldState; rev: number } | null> {
  const snap = await readSnapshot<LoadedJson>(worldId);
  if (!snap) return null;
  const skip = (why: string) => {
    console.log(`[copia] ${worldId}: cópia ignorada (${why}), montando no banco`);
    return null;
  };
  if (snap.rev > rev) return skip(`revisão ${snap.rev} à frente do banco ${rev}`);
  const d = await fetchDelta(worldId, snap.rev);
  if (!d || d.full || !d.world) return skip(`o banco já não tem as mudanças desde a revisão ${snap.rev}`);
  const was = snap.data.world;
  const now = d.world;
  if (was.seed !== now.seed || was.start_game_date !== now.start_game_date || (was.stats?.born_at ?? 0) !== (now.stats?.born_at ?? 0) || was.tick > now.tick) {
    return skip("é de outro mundo com o mesmo id");
  }
  const state = await stateFrom(worldId, snap.data);
  applyDelta(state, d);
  if (state.world.stats?.dropping) throw new Error("Este mundo foi apagado.");
  console.log(`[copia] ${worldId}: mundo montado da cópia (rev ${snap.rev} → ${d.rev})`);
  return { state, rev: d.rev };
}

/** Quando este servidor gravou (ou viu gravada) a cópia de cada mundo pela última vez. */
const snapSaved = new Map<string, number>();
/** Mundo com atividade tem a cópia renovada a cada 30 min (o registro de mudanças do banco cobre 3 h). */
const SNAP_EVERY_MS = 30 * 60_000;

/** Depois da resposta: o trabalho não atrasa a tela (fora de uma requisição, roda solto). */
function inBackground(job: () => Promise<unknown>): void {
  const run = () => job().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

const copyable = (state: WorldState, rev: number | null): rev is number =>
  SNAPSHOTS && rev !== null && !state.world.stats?.building && !state.world.stats?.dropping;

/**
 * O mundo acabou de ser montado no banco, na revisão `rev`: grava a cópia agora mesmo, na própria
 * requisição (depois da resposta o servidor pode ser congelado e a gravação se perder). O texto do
 * mundo é montado na hora; a requisição espera no máximo 4 s pelo envio, que continua sozinho.
 */
async function saveSnapshotNow(worldId: string, state: WorldState, rev: number | null): Promise<void> {
  if (!copyable(state, rev)) return;
  if (Date.now() - (snapSaved.get(worldId) ?? 0) < 2 * 60_000) return;
  snapSaved.set(worldId, Date.now());
  const job = writeSnapshot(worldId, { rev, at: Date.now(), data: snapshotData(state) });
  const ok = await Promise.race([job, new Promise<null>((r) => setTimeout(() => r(null), 4_000))]);
  if (ok === false) snapSaved.delete(worldId);
}

/**
 * Renova a cópia com a memória deste servidor depois de uma gravação (a memória está exatamente na
 * revisão do banco). Uma vez a cada 30 min por mundo, e só se nenhum outro servidor acabou de renovar.
 */
function saveSnapshot(worldId: string, entry: Cached): void {
  if (!copyable(entry.state, entry.rev) || entry.writing) return;
  if (Date.now() - (snapSaved.get(worldId) ?? 0) < SNAP_EVERY_MS) return;
  snapSaved.set(worldId, Date.now());
  inBackground(async () => {
    if (await snapshotNewerThan(worldId, SNAP_EVERY_MS)) return;
    // a memória pode ter mudado enquanto esperava: vale o que ela tem agora, se não estiver gravando
    const rev = entry.rev;
    if (entry.writing || rev === null) {
      snapSaved.delete(worldId);
      return;
    }
    if (!(await writeSnapshot(worldId, { rev, at: Date.now(), data: snapshotData(entry.state) }))) snapSaved.delete(worldId);
  });
}

/** Leituras pesadas ao mesmo tempo nesta instância (cada carga completa são 7 consultas grandes). */
const HEAVY_SLOTS = 3;
let heavyBusy = 0;
const heavyQueue: Array<() => void> = [];

async function heavy<T>(fn: () => Promise<T>): Promise<T> {
  if (heavyBusy < HEAVY_SLOTS) heavyBusy++;
  else await new Promise<void>((ok) => heavyQueue.push(ok));
  try {
    return await fn();
  } finally {
    // a vaga passa direto para quem espera; sem fila, fica livre
    const next = heavyQueue.shift();
    if (next) next();
    else heavyBusy--;
  }
}

const usable = (e: Cached | undefined): e is Cached => !!e && e.rev !== null && Date.now() - e.born < CACHE_MAX_MS;

const asRev = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Revisão do mundo no banco: sobe a cada gravação (null se não deu para ler). */
async function worldRev(worldId: string): Promise<number | null> {
  try {
    return asRev(await rpc<number | null>("world_rev", { p_world: worldId }, { retries: 1 }));
  } catch {
    return null;
  }
}

/** Quem mexe no mundo por fora do motor (exclusão de conta, remoção) avisa: a memória deixa de valer. */
export async function bumpWorldRev(worldId: string, by = 1): Promise<void> {
  cache.delete(worldId);
  await rpc("sim_bump_rev", { p_world: worldId, p_by: by });
}

/** O que a tela leu agora do banco, para conferir se o estado em cache já está pelo menos nesse ponto. */
export interface Freshness {
  tick?: number | null;
  personId?: string;
  /** contador de ações do jogador (sobe a cada ação) */
  seq?: number | null;
}

/** A memória está pelo menos tão adiante quanto o que a tela leu (dia de jogo e ações do jogador)? */
function matches(state: WorldState, f?: Freshness): boolean {
  if (!f) return true;
  if (f.tick != null && state.world.tick < f.tick) return false;
  if (f.personId && f.seq != null && (state.t.person_states.get(f.personId)?.action_seq ?? -1) < f.seq) return false;
  return true;
}

/** Carga completa (uma por vez para cada mundo nesta instância). */
function load(worldId: string): Promise<Cached> {
  let p = loading.get(worldId);
  if (!p) {
    p = (async () => {
      // a revisão é lida antes: se alguém gravar no meio da leitura, a próxima conferência busca o que faltou
      const rev = await worldRev(worldId);
      // primeiro a cópia guardada fora do banco (e só o que mudou depois dela); sem cópia que sirva, o banco
      const copy = rev !== null ? await fromSnapshot(worldId, rev).catch(() => null) : null;
      const entry: Cached = copy
        ? { state: copy.state, born: Date.now(), rev: copy.rev, writing: false }
        : { state: await loadState(worldId), born: Date.now(), rev, writing: false };
      // uma gravação começou aqui mesmo durante a leitura: a memória dela está mais adiante
      if (!cache.get(worldId)?.writing) remember(worldId, entry);
      if (!copy) await saveSnapshotNow(worldId, entry.state, rev);
      return entry;
    })().finally(() => loading.delete(worldId));
    loading.set(worldId, p);
  }
  return p;
}

type SyncResult = "ok" | "full" | "busy";

/** Atualiza a memória com o que mudou no banco desde a revisão dela. */
function sync(worldId: string, entry: Cached): Promise<SyncResult> {
  let p = syncing.get(entry);
  if (!p) {
    p = (async (): Promise<SyncResult> => {
      const d = await fetchDelta(worldId, entry.rev ?? 0);
      // gravando aqui mesmo: a memória já está à frente do banco, e só quem grava mexe nela
      if (entry.writing) return "busy";
      if (!d || d.full) return "full";
      applyDelta(entry.state, d);
      entry.rev = d.rev;
      return "ok";
    })().finally(() => syncing.delete(entry));
    syncing.set(entry, p);
  }
  return p;
}

/**
 * Estado para as telas. Se ninguém gravou desde a revisão em memória, usa a
 * memória; se gravaram, busca só o que mudou. A carga completa fica para a
 * primeira vez em cada instância (ou quando o registro de mudanças não cobre).
 */
export async function cachedState(worldId: string, fresh?: Freshness): Promise<WorldState> {
  const hit = cache.get(worldId);
  if (hit?.writing) return hit.state;
  if (hit && hit.rev === null && Date.now() - hit.born < CACHE_MS) return hit.state;
  if (usable(hit)) {
    const rev = await worldRev(worldId);
    if (hit.writing) return hit.state;
    if (rev !== null && rev === hit.rev && matches(hit.state, fresh)) return hit.state;
    const r = await sync(worldId, hit);
    if (r === "busy" || (r === "ok" && matches(hit.state, fresh))) return hit.state;
  }
  const got = await load(worldId);
  if (matches(got.state, fresh)) return got.state;
  // uma carga que já estava em andamento pode ter começado antes da última ação: completa com o que mudou
  if (usable(got) && (await sync(worldId, got)) !== "full") return got.state;
  return (await load(worldId)).state;
}

/** Mundo trancado para gravar: o estado, a memória que ele ocupa e quem segura o lease. */
interface Opened {
  holder: string;
  state: WorldState;
  entry: Cached;
}

/**
 * Tranca o mundo e devolve o estado (a memória atualizada com o que mudou, ou o
 * mundo lido inteiro). null se outro processo está com ele: esperando até ~4 s,
 * ou sem esperar (avanço em segundo plano).
 */
async function openWorld(worldId: string, opts: { wait?: boolean } = {}): Promise<Opened | null> {
  const holder = crypto.randomUUID();
  const tries = opts.wait === false ? 1 : 6;
  let rev: number | null = null;
  for (let i = 0; i < tries; i++) {
    rev = asRev(await rpc<number | null>("sim_lease_rev", { p_world: worldId, p_holder: holder, p_seconds: 90 }));
    if (rev !== null) break;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 700));
  }
  if (rev === null) return null;
  let entry: Cached | undefined;
  try {
    const hit = cache.get(worldId);
    if (usable(hit) && !hit.writing) {
      // daqui em diante só esta gravação mexe na memória (as telas leem dela como está)
      hit.writing = true;
      entry = hit;
      if (hit.rev !== rev) {
        // com o lease na mão, o registro tem tudo o que mudou desde a revisão da memória
        const d = await fetchDelta(worldId, hit.rev!);
        if (d && !d.full) {
          applyDelta(hit.state, d);
          hit.rev = d.rev;
        } else {
          hit.writing = false;
          entry = undefined;
        }
      }
    }
    if (!entry) {
      const copy = await fromSnapshot(worldId, rev).catch(() => null);
      entry = copy
        ? { state: copy.state, born: Date.now(), rev: copy.rev, writing: true }
        : { state: await loadState(worldId), born: Date.now(), rev, writing: true };
      // com o lease na mão, a memória recém-montada está exatamente na revisão do banco
      if (!copy) await saveSnapshotNow(worldId, entry.state, rev);
    }
    if (entry.state.world.stats?.building) {
      // mundo criado pela metade (criação interrompida): completa antes de mexer nele
      entry.writing = false;
      if (cache.get(worldId) === entry) cache.delete(worldId);
      await ensureWorld(yearOfWorld(worldId), worldId);
      entry = { state: await loadState(worldId), born: Date.now(), rev: await worldRev(worldId), writing: true };
      if (entry.state.world.stats?.building) throw new Error("O mundo ainda está sendo montado. Tente de novo em instantes.");
    }
    remember(worldId, entry);
    return { holder, state: entry.state, entry };
  } catch (e) {
    if (entry) {
      entry.writing = false;
      if (cache.get(worldId) === entry) cache.delete(worldId);
    }
    await rpc("sim_release_rev", { p_world: worldId, p_holder: holder, p_dirty: false }).catch(() => undefined);
    throw e;
  }
}

/** Libera o mundo. Deu certo: a memória fica com o estado novo e a revisão nova; deu errado: esquece. */
async function closeWorld(worldId: string, w: Opened, dirty: boolean, ok: boolean): Promise<void> {
  const rev = asRev(await rpc<number | null>("sim_release_rev", { p_world: worldId, p_holder: w.holder, p_dirty: dirty }).catch(() => null));
  w.entry.writing = false;
  if (ok && rev !== null) {
    w.entry.rev = rev;
    trimToLoad(w.entry.state);
    remember(worldId, w.entry);
    saveSnapshot(worldId, w.entry);
  } else if (cache.get(worldId) === w.entry) {
    cache.delete(worldId);
  }
}

/**
 * Abre o mundo com exclusividade, avança o relógio até o presente (com limite),
 * executa `fn` (ações do jogador) e grava tudo.
 */
export async function withWorld<T>(
  worldId: string,
  fn?: (state: WorldState, actionCtx: (personId: string) => Ctx) => T,
  opts: { maxTicks?: number; budgetMs?: number; waitLease?: boolean } = {},
): Promise<{ result?: T; ticks: number; state: WorldState }> {
  const w = await openWorld(worldId, { wait: opts.waitLease });
  if (!w) throw new Error("O mundo está ocupado processando o dia. Tente de novo em instantes.");
  let dirty = false;
  let ok = false;
  try {
    const state = w.state;
    const expected = state.world.tick;
    const now = new Date().toISOString();
    const aligned = alignClock(worldId, state, now);
    const target = targetTick(state, now);
    // o relógio do mundo compartilhado andou: quem jogou nos últimos dias vive esses dias (recebe acontecimentos)
    if (target > state.world.tick && modeOfWorld(worldId) === "SHARED") state.living = new Set(await activePlayers(worldId));
    let run: ReturnType<typeof runTicks>;
    try {
      run = runTicks(state, { target, maxTicks: opts.maxTicks ?? MAX_CATCHUP, budgetMs: opts.budgetMs ?? 12_000, now: () => Date.now(), tolerant: true });
    } finally {
      state.living = undefined;
    }
    const { ctx, ticks } = run;
    if (aligned) ctx.saveWorld();
    const actionChanges: Changes[] = [];
    const makeCtx = (personId: string) => {
      // fase única por personagem e sequência de ações: ids e sorteios reprodutíveis
      const seq = state.t.person_states.get(personId)?.action_seq ?? 0;
      const c = new Ctx(state, `action:${personId}:${seq}`);
      actionChanges.push(c.changes);
      return c;
    };
    let result: T | undefined;
    if (fn) result = fn(state, makeCtx);
    const changes = new Changes();
    changes.merge(ctx.changes);
    for (const c of actionChanges) changes.merge(c);
    if (changes.count() > 0 || ticks > 0 || aligned) {
      dirty = true;
      await persist(worldId, changes, expected, state);
    }
    ok = true;
    await logFaults(worldId, ctx.faults);
    return { result, ticks, state };
  } finally {
    await closeWorld(worldId, w, dirty, ok);
  }
}

/**
 * Etapas do dia que quebraram e foram puladas (o motor em modo tolerante não trava o mundo):
 * vão para o registro de erros, uma vez por etapa e mensagem.
 */
async function logFaults(worldId: string, faults: DayFault[]): Promise<void> {
  const seen = new Set<string>();
  const once = faults.filter((f) => {
    const key = `${f.step}|${f.error.message}`;
    return !seen.has(key) && !!seen.add(key);
  });
  await Promise.all(once.slice(0, 5).map((f) => reportError("motor", `${worldId} · ${f.step} · ${f.date}`, f.error)));
}

/** Avança um mundo (cron / catch-up em segundo plano). */
export async function advanceWorld(year: number, maxTicks = MAX_CATCHUP): Promise<number> {
  const { ticks } = await withWorld(worldIdFor(year), undefined, { maxTicks });
  return ticks;
}

/** Última tentativa de alcançar o relógio em segundo plano, por mundo, nesta instância. */
const bgTried = new Map<string, number>();
const BG_EVERY_MS = 90_000;

/**
 * O relógio do mundo compartilhado atrasou: avança depois da resposta da tela.
 * No máximo uma tentativa por mundo a cada 90 s nesta instância e sem esperar o
 * lease (se outro servidor já está avançando, este desiste na hora).
 */
export async function backgroundAdvance(year: number): Promise<void> {
  const worldId = worldIdFor(year);
  if (Date.now() - (bgTried.get(worldId) ?? 0) < BG_EVERY_MS) return;
  // a memória (que a tela acabou de conferir) já está no dia de hoje: nada a avançar, sem trancar o mundo
  const mem = cache.get(worldId);
  if (mem && !mem.writing && targetTick(mem.state, new Date().toISOString()) <= mem.state.world.tick) return;
  bgTried.set(worldId, Date.now());
  try {
    await withWorld(worldId, undefined, { budgetMs: 10_000, waitLease: false });
  } catch {
    // ocupado ou banco lento: a próxima tela tenta de novo
  }
}

export interface PersonSnapshot {
  stage: string;
  energy: number;
  money: number;
  reputation: number;
  party: string | null;
}

/** Termômetro do país antes e depois do período. */
export interface CountrySnapshot {
  approval: number;
  selic: number | null;
  inflation: number | null;
  unemployment: number | null;
  gdp: number | null;
  fx: number | null;
}

export interface FastForwardResult {
  ok: boolean;
  message: string;
  days: number;
  from?: string;
  to?: string;
  headlines?: Array<{ headline: string; lede: string; category: string; date: string; factual: boolean; importance: number }>;
  /** quantas notícias públicas o período produziu */
  newsCount?: number;
  country?: { before: CountrySnapshot; after: CountrySnapshot };
  notifications?: Array<{ title: string; body: string; link: string | null }>;
  /** seu personagem antes e depois do período */
  before?: PersonSnapshot | null;
  after?: PersonSnapshot | null;
  /** aviso do relógio compartilhado (parada na véspera de um marco) */
  note?: string;
}

const ALLOWED_DAYS = new Set([1, 7, 15, 30]);

const firstSentence = (t: string) => {
  const m = t.match(/^.{20,220}?[.!?](\s|$)/);
  return (m ? m[0] : t.slice(0, 200)).trim();
};

function countryOf(state: WorldState): CountrySnapshot {
  const eco: EconomyRow | null | undefined = state.economy;
  return {
    approval: state.world.gov.approval,
    selic: eco?.selic ?? null,
    inflation: eco?.inflation_12m ?? null,
    unemployment: eco?.unemployment ?? null,
    gdp: eco?.gdp_growth ?? null,
    fx: eco?.fx ?? null,
  };
}

function snapshotOf(state: WorldState, userId: string): PersonSnapshot | null {
  const p = [...state.t.persons.values()].find((x) => x.user_id === userId && x.status === "ACTIVE");
  const st = p ? state.t.person_states.get(p.id) : undefined;
  if (!p || !st) return null;
  return { stage: p.stage, energy: Math.round(st.energy), money: Math.round(st.money), reputation: Math.round(p.reputation), party: p.party_id ? state.t.parties.get(p.party_id)?.acronym ?? null : null };
}

/* ---------- relógio dos mundos compartilhados (regras no motor: clock.ts) ---------- */

/**
 * Mundo compartilhado ainda num relógio antigo (outra velocidade): passa para o relógio atual a
 * partir de agora, sem pular dias. Mundo só do jogador: relógio parado.
 */
function alignClock(worldId: string, state: WorldState, nowIso: string): boolean {
  const speed = modeOfWorld(worldId) === "SHARED" ? SHARED_SPEED : 0;
  const w = state.world;
  if (w.game_days_per_real_hour === speed) return false;
  w.anchor_tick = w.tick;
  w.anchor_real_at = nowIso;
  w.game_days_per_real_hour = speed;
  return true;
}

/** Quem agiu no mundo nas últimas 72 h (ação, personagem novo), guardado por 5 min em cada servidor. */
const activeCache = new Map<string, { at: number; ids: string[] }>();
async function activePlayers(worldId: string): Promise<string[]> {
  const hit = activeCache.get(worldId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ids;
  try {
    const { data } = await db(playerToken.getStore()).rpc("clock_activity", { p_world: worldId });
    const ids = ((data ?? null) as { active?: string[] } | null)?.active ?? [];
    activeCache.set(worldId, { at: Date.now(), ids });
    return ids;
  } catch {
    return hit?.ids ?? [];
  }
}

const SHARED_ONLY_AUTO = () =>
  "Neste mundo compartilhado o tempo anda sozinho, igual para todos: 2 meses de jogo a cada 2 horas (1 dia a cada 2 minutos) e, da 0h às 7h de Brasília, 1 semana a cada 2 horas.";

export interface WorldClock {
  /** mundo compartilhado: o tempo anda sozinho, igual para todos */
  shared: boolean;
  /** outros jogadores que jogaram nas últimas 72 h */
  others: number;
  /** madrugada (ritmo lento) agora */
  night: boolean;
  /** dias de jogo por hora real agora */
  perHour: number;
  /** quando o ritmo muda (hora real, ISO) e a hora de Brasília da mudança */
  changesAt: string | null;
  changesLabel: string | null;
}

/** O relógio do mundo para o Painel. */
export async function worldClock(worldId: string, personId: string | null): Promise<WorldClock> {
  if (modeOfWorld(worldId) !== "SHARED") return { shared: false, others: 0, night: false, perHour: 0, changesAt: null, changesLabel: null };
  const pace = clockPace(Date.now());
  const active = await activePlayers(worldId);
  return {
    shared: true,
    others: active.filter((id) => id !== personId).length,
    night: pace.night,
    perHour: pace.perHour,
    changesAt: new Date(pace.changesAt).toISOString(),
    changesLabel: `${brasiliaHour(pace.changesAt)}h`,
  };
}

/**
 * Cron: leva os mundos compartilhados até o relógio, em blocos, até acabar o tempo. A ordem
 * dos mundos muda a cada rodada para nenhum ficar sempre por último.
 */
export async function advanceSharedWorlds(budgetMs: number): Promise<Record<string, number | string>> {
  const started = Date.now();
  const ticks: Record<string, number | string> = {};
  const years = [...START_YEARS].sort(() => Math.random() - 0.5);
  for (const y of years) {
    if (Date.now() - started > budgetMs) break;
    try {
      if (!(await worldExists(worldIdFor(y)))) continue;
      let total = 0;
      for (;;) {
        const t = await advanceWorld(y, MAX_CATCHUP);
        total += t;
        if (t < MAX_CATCHUP || Date.now() - started > budgetMs) break;
      }
      ticks[y] = total;
    } catch (e) {
      ticks[y] = e instanceof Error ? e.message : "erro";
      // um jogador já está levando este mundo até o relógio agora: nada a fazer, não é erro
      if (!/ocupado/i.test(String(ticks[y]))) await reportError("cron", `relogio#${y}`, e);
    }
  }
  return ticks;
}

/**
 * "Avançar o tempo": processa N dias imediatamente. Só nos mundos do próprio
 * jogador; nos compartilhados o tempo anda sozinho, igual para todos.
 */
export async function fastForward(worldId: string, days: number, userId: string): Promise<FastForwardResult> {
  if (modeOfWorld(worldId) === "SHARED") return { ok: false, message: SHARED_ONLY_AUTO(), days: 0 };
  if (!ALLOWED_DAYS.has(days)) return { ok: false, message: "Escolha 1, 7, 15 ou 30 dias.", days };
  const w = await openWorld(worldId);
  if (!w) return { ok: false, message: "O mundo está processando outro avanço. Tente em instantes.", days };
  let dirty = false;
  let ok = false;
  try {
    const state = w.state;
    const me = [...state.t.persons.values()].find((x) => x.user_id === userId && x.status === "ACTIVE") ?? null;
    const before = snapshotOf(state, userId);
    const countryBefore = countryOf(state);
    const expected = state.world.tick;
    const now = new Date().toISOString();
    alignClock(worldId, state, now);
    const from = state.world.game_date;
    const start = state.world.tick;
    const { ctx, ticks } = runTicks(state, { target: start + days, maxTicks: days, budgetMs: 25_000, now: () => Date.now(), tolerant: true });
    const manual = Math.max(0, state.world.tick - start);
    state.world.anchor_tick = state.world.tick;
    state.world.anchor_real_at = now;
    ctx.saveWorld();
    // registro do avanço (atividade do mundo próprio)
    ctx.emit("TIME_ADVANCED", { actors: me ? [me.id] : [], geography: "BR", payload: { days: manual, from, to: state.world.game_date } });
    dirty = true;
    await persist(worldId, ctx.changes, expected, state);
    ok = true;
    await logFaults(worldId, ctx.faults);
    const news = ctx.changes.get("news_articles").filter((n) => n.visibility === "PUBLIC" || n.user_id === userId);
    const headlines = news
      .sort((a, b) => b.importance - a.importance || b.tick - a.tick)
      .slice(0, 16)
      .map((n) => ({ headline: n.headline, lede: firstSentence(n.body), category: n.category, date: n.game_date, factual: n.factual, importance: n.importance }));
    const notifications = ctx.changes
      .get("notifications")
      .filter((n) => n.user_id === userId)
      .map((n) => ({ title: n.title, body: n.body, link: n.link }));
    return {
      ok: true,
      message: `${ticks} dia(s) processado(s).`,
      days: ticks,
      from,
      to: state.world.game_date,
      headlines,
      newsCount: news.length,
      notifications,
      before,
      after: snapshotOf(state, userId),
      country: { before: countryBefore, after: countryOf(state) },
    };
  } finally {
    await closeWorld(worldId, w, dirty, ok);
  }
}

/* ---------- viver os dias: avanço dia a dia, com pausa nas decisões ---------- */

export interface StepAdvanceResult extends FastForwardResult {
  /** diário do período: um item por dia vivido */
  diary?: DayDigest[];
  /** por que parou antes do fim: decisão que segura o tempo, fim da carreira ou limite de processamento */
  stop?: "decisao" | "fim" | "limite" | null;
  /** acontecimento que fez o relógio parar (aparece na tela na hora) */
  stopOn?: string;
  /** dia de votação no período: a apuração da disputa do jogador e das principais do dia */
  apuracoes?: Apuracao[];
  /** acontecimentos esperando resposta (os que seguram o tempo primeiro) */
  pending?: StoryEvent[];
  /** dias pedidos e dias que ainda faltam (o relógio retoma daí depois da decisão) */
  requested?: number;
  remaining?: number;
  /** números da barra lateral no fim deste trecho (a tela atualiza sem esperar o período acabar) */
  vitals?: LiveVitals;
}

function activePlayer(state: WorldState, userId: string) {
  return [...state.t.persons.values()].find((x) => x.user_id === userId && x.status === "ACTIVE" && x.kind === "PLAYER") ?? null;
}

/**
 * Passar o tempo vivendo cada dia: o relógio automático alcança o presente
 * (sem acontecimentos sorteados) e então os dias pedidos passam um a um para o
 * jogador, parando quando surge uma decisão que segura o tempo. A tela anima
 * o diário e, depois da resposta, pede o resto dos dias.
 */
export async function advanceStep(worldId: string, days: number, userId: string): Promise<StepAdvanceResult> {
  if (modeOfWorld(worldId) === "SHARED") return { ok: false, message: SHARED_ONLY_AUTO(), days: 0 };
  if (!Number.isInteger(days) || days < 1 || days > 31) return { ok: false, message: "Escolha entre 1 e 31 dias.", days: 0 };
  const w = await openWorld(worldId);
  if (!w) return { ok: false, message: "O mundo está processando outro avanço. Tente em instantes.", days: 0 };
  let dirty = false;
  let ok = false;
  try {
    const state = w.state;
    const me = activePlayer(state, userId);
    // saídas antes de mexer no mundo: o estado lido continua valendo na memória
    if (!me) return (ok = true), { ok: false, message: "Você não tem personagem ativo neste mundo.", days: 0, stop: "fim" };
    const before = snapshotOf(state, userId);
    const countryBefore = countryOf(state);
    const expected = state.world.tick;
    const now = new Date().toISOString();
    alignClock(worldId, state, now);
    const from = state.world.game_date;
    // os dias vividos pelo jogador, um a um (o relógio deste mundo só anda assim)
    const step = stepDays(state, me.id, { days, budgetMs: 20_000, now: () => Date.now(), tolerant: true });
    const manual = step.ticks;
    state.world.anchor_tick = state.world.tick;
    state.world.anchor_real_at = now;
    step.ctx.saveWorld();
    if (manual > 0) step.ctx.emit("TIME_ADVANCED", { actors: [me.id], geography: "BR", payload: { days: manual, from, to: state.world.game_date } });
    const changes = new Changes();
    changes.merge(step.ctx.changes);
    dirty = true;
    await persist(worldId, changes, expected, state);
    ok = true;
    await logFaults(worldId, step.ctx.faults);
    const news = changes.get("news_articles").filter((n) => n.visibility === "PUBLIC" || n.user_id === userId);
    const headlines = news
      .sort((a, b) => b.importance - a.importance || b.tick - a.tick)
      .slice(0, 16)
      .map((n) => ({ headline: n.headline, lede: firstSentence(n.body), category: n.category, date: n.game_date, factual: n.factual, importance: n.importance }));
    const notifications = changes
      .get("notifications")
      .filter((n) => n.user_id === userId)
      .map((n) => ({ title: n.title, body: n.body, link: n.link }));
    return {
      ok: true,
      message: `${manual} dia(s) vivido(s).`,
      days: manual,
      from,
      to: state.world.game_date,
      headlines,
      newsCount: news.length,
      notifications,
      before,
      after: snapshotOf(state, userId),
      country: { before: countryBefore, after: countryOf(state) },
      diary: step.days,
      stop: step.stop,
      stopOn: step.stopOn,
      apuracoes: manual > 0 ? electionNight(state, me.id, from, state.world.game_date) : undefined,
      pending: pendingFor(state, me.id),
      requested: days,
      remaining: Math.max(0, days - manual),
      vitals: liveVitals(state, me.id),
    };
  } finally {
    await closeWorld(worldId, w, dirty, ok);
  }
}

export interface DecideResult {
  ok: boolean;
  message: string;
  title?: string;
  outcome?: string;
  choiceLabel?: string;
  deltas?: StoryDelta[];
  pending?: StoryEvent[];
  /** a decisão encerrou a carreira (aposentadoria) */
  ended?: boolean;
  /** a escolha fez a carreira subir de etapa */
  stage?: { from: string; to: string };
  /** números da barra lateral depois da escolha (mudam na hora, no meio do período) */
  vitals?: LiveVitals;
}

/** Resposta a um acontecimento (sem avançar o relógio). */
export async function decideStory(worldId: string, userId: string, eventId: string, choiceId: string): Promise<DecideResult> {
  let personId: string | null = null;
  let stageBefore: string | null = null;
  const { result, state } = await withWorld(
    worldId,
    (state, mk) => {
      const me = activePlayer(state, userId);
      if (!me) return { ok: false, message: "Você não tem personagem ativo neste mundo." };
      personId = me.id;
      stageBefore = me.stage;
      return resolveStory(mk(me.id), me.id, eventId, choiceId);
    },
    { maxTicks: 0 },
  );
  const r = result ?? { ok: false, message: "Sem resposta." };
  const st = personId ? state.t.person_states.get(personId) : undefined;
  const stageAfter = personId ? state.t.persons.get(personId)?.stage : undefined;
  const stage = r.ok && stageBefore && stageAfter && stageAfter !== stageBefore ? { from: stageBefore, to: stageAfter } : undefined;
  return { ...r, pending: personId ? pendingFor(state, personId) : [], ended: !!st?.story?.ended, stage, vitals: liveVitals(state, personId) };
}

export type CareerEndView = CareerSummary & { personId: string };

/**
 * Balanço de uma carreira encerrada. Mandatos, candidaturas e filiações antigas
 * não ficam na memória do mundo: vêm do banco e entram só nesta leitura.
 */
export async function careerEnd(worldId: string, personId: string): Promise<CareerEndView | null> {
  const state = await cachedState(worldId);
  if (!state.t.persons.get(personId)) return null;
  const read = db(playerToken.getStore());
  const [cands, mems, mands] = await Promise.all([
    read.from("candidacies").select("*").eq("world_id", worldId).eq("person_id", personId),
    read.from("memberships").select("*").eq("world_id", worldId).eq("person_id", personId),
    read.from("mandates").select("*").eq("world_id", worldId).eq("person_id", personId),
  ]);
  const merged = <K extends "candidacies" | "memberships" | "mandates">(name: K, rows: unknown[] | null) => {
    const m = new Map(state.t[name] as Map<string, unknown>);
    for (const row of (rows ?? []) as Array<{ id: string }>) if (!m.has(row.id)) m.set(row.id, row);
    return m as WorldState["t"][K];
  };
  const view: WorldState = {
    ...state,
    t: { ...state.t, candidacies: merged("candidacies", cands.data), memberships: merged("memberships", mems.data), mandates: merged("mandates", mands.data) },
  };
  const sum = careerSummary(new Ctx(view, "read"), personId);
  return sum ? { ...sum, personId } : null;
}

/** Exclusão de conta: o motor limpa os dados do jogador em cada mundo antes de o banco anonimizar o personagem. */
export async function clearPlayerWorlds(chars: Array<{ world_id: string; person_id: string }>): Promise<void> {
  for (const c of chars) {
    // mundo próprio: sai inteiro, junto com o personagem
    if (modeOfWorld(c.world_id) !== "SHARED") {
      await dropWorld(c.world_id).catch(() => undefined);
      continue;
    }
    await withWorld(c.world_id, (_state, mk) => clearPlayerData(mk(c.person_id), c.person_id), { maxTicks: 0 }).catch(() => undefined);
  }
}

/** Uma linha barata por mundo (todos os mundos). */
export interface AdminWorldRow {
  id: string;
  game_date: string;
  tick: number;
  anchor_real_at: string;
  anchor_tick?: number;
  speed: number;
  created_at?: string;
  players: number;
  players_24h: number;
  actions_24h: number;
  advances_24h: number;
  last_active?: string | null;
  /** sendo removido (aos pedaços) ou avisado de que vai ser removido por estar parado */
  dropping?: boolean;
  warned?: boolean;
}

/** Detalhes que só valem a conta nos mundos compartilhados. */
export interface AdminSharedWorld {
  id: string;
  persons: number;
  acts: number;
  acts_discovered: number;
  investigations_open: number;
  investigations_closed: number;
  convictions: number;
  news: number;
  parties_player: number;
  economy: Array<{ month: string; selic: number; inflation: number; unemployment: number; gdp: number }>;
}

export interface AdminOverview {
  now: string;
  db_bytes: number;
  accounts: number;
  accounts_7d: number;
  accounts_24h?: number;
  unconfirmed: number;
  errors_24h: number;
  errors_7d: number;
  errors: Array<{ at: string; source: string; path: string | null; message: string; digest: string | null }>;
  tables: Array<{ name: string; bytes: number }>;
  worlds: AdminWorldRow[];
  /** banco ainda sem o painel leve: os detalhes vêm dentro de cada mundo */
  shared?: AdminSharedWorld[];
}

/** Números agregados para o painel de saúde (só para administradores). Sem abrir mundo nenhum. */
export function adminOverview(): Promise<AdminOverview> {
  return rpc<AdminOverview>("admin_overview", {}, { retries: 0 });
}

/** Dias que o relógio de um mundo compartilhado está atrasado (os próprios só andam quando o dono avança). */
export function lagDaysOf(w: Pick<AdminWorldRow, "tick" | "anchor_real_at" | "anchor_tick" | "speed">, now = Date.now()): number {
  if (!w.speed || w.anchor_tick == null) return 0;
  return Math.max(0, clockTarget({ anchor_real_at: w.anchor_real_at, anchor_tick: w.anchor_tick, game_days_per_real_hour: w.speed }, now) - w.tick);
}

export { reportError as logError } from "./report-error";

export interface MaintenanceResult {
  news: number;
  events: number;
  notifications: number;
  /** donos de mundos próprios parados, a avisar por e-mail (rule_days: 10 para mundos quase sem uso, 90 para os demais) */
  warn: Array<{ world: string; email: string; last_active: string; delete_after: string; rule_days?: number }>;
  dropped: string[];
}

/** Poda diária do banco e limpeza de mundos próprios parados (regras em sim_maintenance). */
export async function runMaintenance(): Promise<MaintenanceResult> {
  const res = await rpc<MaintenanceResult>("sim_maintenance", {});
  for (const id of res.dropped) {
    cache.delete(id);
    fictionCities.delete(id);
  }
  return res;
}
