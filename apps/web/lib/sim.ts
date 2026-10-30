/**
 * Ponte entre o motor (@dp/engine) e o banco. Só roda no servidor.
 * O motor decide o que acontece; aqui só carregamos estado, avançamos o
 * relógio do mundo, aplicamos ações e gravamos as mudanças.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadCities, loadSnapshot } from "@dp/data";
import {
  addDays,
  canonicalGeo,
  careerSummary,
  geoName,
  OFFICES,
  Changes,
  clearPlayerData,
  createInitialWorld,
  MILESTONE_HOLD_MIN,
  pendingFor,
  planAdvance,
  PRIVATE_FLAG,
  resolveStory,
  stepDays,
  SHARED_DAYS_PER_HOUR,
  Ctx,
  DEFAULT_RULESET,
  emptyTables,
  FICTIONAL_FLAG,
  fictionalizeCities,
  fictionalizeWorld,
  formatDatePt,
  hydrateState,
  runTicks,
  STATEFUL_TABLES,
  START_YEARS,
  targetTick,
  type CityBase,
  type CareerSummary,
  type ClockAdvance,
  type ClockStatus,
  type DayDigest,
  type EconomyRow,
  type StoryDelta,
  type StoryEvent,
  type WorldRow,
  type WorldState,
} from "@dp/engine";
import { simSecret, SUPABASE_KEY, SUPABASE_URL } from "./env";

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

/** Velocidade padrão: 2 dias de jogo por hora real (ajustável por ambiente). */
const SPEED = Number(process.env.WORLD_GAME_DAYS_PER_HOUR ?? "2");
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

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const token = playerToken.getStore();
  const call = (t?: string) => db(t).rpc(fn, { p_secret: simSecret(), ...args });
  let { data, error } = await call(token);
  // token vencido ou recusado: segue no papel anônimo
  if (error && token && (/^PGRST3/.test(error.code ?? "") || /jwt/i.test(error.message))) ({ data, error } = await call());
  // banco num pico de carga: tenta de novo (leituras e gravações do motor são idempotentes)
  for (let i = 0; error && i < 2 && (error.code === "57014" || /statement timeout/i.test(error.message)); i++) {
    await new Promise((ok) => setTimeout(ok, 400 * (i + 1)));
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

/** Remove um mundo próprio inteiro (o banco recusa os compartilhados). */
export async function dropWorld(worldId: string): Promise<void> {
  if (modeOfWorld(worldId) === "SHARED") return;
  await rpc("sim_drop_world", { p_world: worldId });
  cache.delete(worldId);
  fictionCities.delete(worldId);
}

const cityCache = new Map<number, Promise<Map<string, CityBase>>>();

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

/** Grava um lote; se estourar o tempo do banco, divide ao meio e tenta de novo (o upsert é idempotente). */
async function applyBatch(worldId: string, batch: Batch): Promise<void> {
  try {
    await rpc("sim_apply", { p_world: worldId, p_changes: batch, p_expected_tick: null });
  } catch (e) {
    if (!isTimeout(e) || rowsIn(batch) < 2) throw e;
    const [a, b] = halves(batch);
    await applyBatch(worldId, a);
    await applyBatch(worldId, b);
  }
}

/** Grava as mudanças em lotes paralelos; a linha do mundo vai por último, com checagem de tick. */
export async function persist(worldId: string, changes: Changes, expectedTick: number | null): Promise<void> {
  const json = changes.toJSON();
  const worldRows = json.worlds ?? [];
  delete json.worlds;
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
  let next = 0;
  const workers = Array.from({ length: Math.min(PARALLEL_BATCHES, batches.length) }, async () => {
    while (next < batches.length) await applyBatch(worldId, batches[next++]);
  });
  // espera todos terminarem antes de falhar: nada fica gravando depois que o mundo é liberado
  const failed = (await Promise.allSettled(workers)).find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason;
  if (worldRows.length) {
    await rpc("sim_apply", { p_world: worldId, p_changes: { worlds: worldRows }, p_expected_tick: expectedTick });
  }
}

/**
 * Cria o mundo de um ponto de partida (idempotente: a seed é fixa por mundo).
 * Mundos próprios têm o relógio parado (só andam quando o dono avança) e,
 * no modo fictício, nomes inventados para todas as pessoas e partidos.
 */
export async function ensureWorld(year: number, worldId = worldIdFor(year)): Promise<void> {
  if (!isStartYear(year) || yearOfWorld(worldId) !== year) throw new Error("Ponto de partida inválido");
  if (await worldExists(worldId)) return;
  const mode = modeOfWorld(worldId);
  const snap = await loadSnapshot(year);
  const cities = await citiesFor(year);
  const base = `dominio-politico-${year}-${WORLD_VERSION}`;
  const { state, changes } = createInitialWorld(snap, {
    cities: [...cities.values()],
    worldId,
    seed: mode === "SHARED" ? base : `${base}|${worldId}`,
    startRealAt: new Date().toISOString(),
    gameDaysPerRealHour: mode === "SHARED" ? SPEED : 0,
    name: mode === "SHARED" ? `Brasil pós-${year}` : `Brasil pós-${year} · só seu`,
  });
  if (mode !== "SHARED") state.world.stats[PRIVATE_FLAG] = 1;
  if (mode === "FICTIONAL") fictionalizeWorld(state, changes);
  // linha do mundo primeiro (com start_year) para as próximas leituras
  const worldRow = { ...state.world, start_year: year };
  await rpc("sim_apply", { p_world: state.world.id, p_changes: { worlds: [worldRow] }, p_expected_tick: null });
  changes.rows.delete("worlds");
  await persist(state.world.id, changes, null);
}

type LoadedJson = Record<string, unknown[]> & { world: WorldRow; economy: EconomyRow };

const LOAD_PARTS = ["core", "persons", "person_states", "parties", "elections", "mandates", "crime"] as const;

/** Busca o mundo em partes paralelas (cada uma bem abaixo do limite de tempo do banco); cai no sim_load inteiro se preciso. */
async function fetchWorld(worldId: string): Promise<LoadedJson | null> {
  try {
    const parts = await Promise.all(LOAD_PARTS.map((part) => rpc<Record<string, unknown> | null>("sim_load_part", { p_world: worldId, p_part: part })));
    if (parts.some((x) => !x)) return null;
    return Object.assign({}, ...parts) as LoadedJson;
  } catch (e) {
    if (e instanceof Error && /sim_load_part/.test(e.message) && /function|does not exist|schema cache/i.test(e.message)) {
      return rpc<LoadedJson | null>("sim_load", { p_world: worldId });
    }
    throw e;
  }
}

export async function loadState(worldId: string): Promise<WorldState> {
  const data = await fetchWorld(worldId);
  if (!data) throw new Error("Mundo não encontrado");
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
  return hydrateState({ world: data.world, economy: data.economy, ruleset: DEFAULT_RULESET, t, cities });
}

/** Municípios já convertidos para os nomes de cada mundo fictício. */
const fictionCities = new Map<string, Map<string, CityBase>>();

const cache = new Map<string, { state: WorldState; at: number }>();
const loading = new Map<string, Promise<WorldState>>();
const CACHE_MS = 8_000;

/** O que a tela leu agora do banco, para conferir se o estado em cache ainda vale. */
export interface Freshness {
  tick?: number | null;
  personId?: string;
  /** contador de ações do jogador (sobe a cada ação) */
  seq?: number | null;
}

function matches(state: WorldState, f?: Freshness): boolean {
  if (!f) return true;
  if (f.tick != null && state.world.tick !== f.tick) return false;
  if (f.personId && f.seq != null && state.t.person_states.get(f.personId)?.action_seq !== f.seq) return false;
  return true;
}

function load(worldId: string): Promise<WorldState> {
  let p = loading.get(worldId);
  if (!p) {
    p = loadState(worldId)
      .then((state) => {
        cache.set(worldId, { state, at: Date.now() });
        return state;
      })
      .finally(() => loading.delete(worldId));
    loading.set(worldId, p);
  }
  return p;
}

/**
 * Estado recente para as telas: vale por até 8 s, mas é recarregado na hora
 * se o relógio andou ou se o jogador agiu desde a última leitura.
 */
export async function cachedState(worldId: string, fresh?: Freshness): Promise<WorldState> {
  const hit = cache.get(worldId);
  if (hit && Date.now() - hit.at < CACHE_MS && matches(hit.state, fresh)) return hit.state;
  const state = await load(worldId);
  // uma carga que já estava em andamento pode ter começado antes da última ação
  return matches(state, fresh) ? state : load(worldId);
}

async function acquire(worldId: string, holder: string): Promise<boolean> {
  for (let i = 0; i < 6; i++) {
    if (await rpc<boolean>("sim_lease", { p_world: worldId, p_holder: holder, p_seconds: 90 })) return true;
    await new Promise((r) => setTimeout(r, 700));
  }
  return false;
}

/**
 * Abre o mundo com exclusividade, avança o relógio até o presente (com limite),
 * executa `fn` (ações do jogador) e grava tudo.
 */
export async function withWorld<T>(
  worldId: string,
  fn?: (state: WorldState, actionCtx: (personId: string) => Ctx) => T,
  opts: { maxTicks?: number } = {},
): Promise<{ result?: T; ticks: number; state: WorldState }> {
  const holder = crypto.randomUUID();
  if (!(await acquire(worldId, holder))) throw new Error("O mundo está ocupado processando o dia. Tente de novo em instantes.");
  try {
    const state = await loadState(worldId);
    const expected = state.world.tick;
    const target = targetTick(state, new Date().toISOString());
    const { ctx, ticks } = runTicks(state, { target, maxTicks: opts.maxTicks ?? MAX_CATCHUP, budgetMs: 15_000, now: () => Date.now() });
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
    if (changes.count() > 0 || ticks > 0) await persist(worldId, changes, expected);
    cache.set(worldId, { state, at: Date.now() });
    return { result, ticks, state };
  } finally {
    await rpc("sim_release", { p_world: worldId, p_holder: holder }).catch(() => undefined);
  }
}

/** Avança um mundo (cron / catch-up em segundo plano). */
export async function advanceWorld(year: number, maxTicks = MAX_CATCHUP): Promise<number> {
  const { ticks } = await withWorld(worldIdFor(year), undefined, { maxTicks });
  return ticks;
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

/* ---------- relógio compartilhado (regras no motor: planAdvance) ---------- */

/** Quem está jogando neste mundo e quanto o tempo foi avançado na última hora. Sem a função no banco, vale o modo solo. */
export async function clockStatus(worldId: string, personId: string | null): Promise<ClockStatus> {
  type Raw = { active: string[]; advances: ClockAdvance[]; hour: { days: number; oldest: string | null }; now: string };
  const { data } = await db(playerToken.getStore()).rpc("clock_activity", { p_world: worldId });
  const raw = (data ?? null) as Raw | null;
  const now = raw?.now ?? new Date().toISOString();
  const others = (raw?.active ?? []).filter((id) => id !== personId);
  const shared = others.length > 0;
  const remaining = shared ? Math.max(0, SHARED_DAYS_PER_HOUR - (raw?.hour.days ?? 0)) : null;
  const oldest = raw?.hour.oldest;
  return {
    others,
    shared,
    remaining,
    freesAt: shared && oldest && (remaining ?? 0) < 30 ? new Date(Date.parse(oldest) + 3_600_000).toISOString() : null,
    recent: raw?.advances ?? [],
    now,
  };
}

/**
 * "Avançar o tempo": processa N dias imediatamente e reancora o relógio real
 * no novo dia (o relógio automático continua dali). Vale para todo o mundo:
 * sozinho, sem limite; com outros jogadores ativos, segue o planAdvance.
 */
export async function fastForward(worldId: string, days: number, userId: string): Promise<FastForwardResult> {
  if (!ALLOWED_DAYS.has(days)) return { ok: false, message: "Escolha 1, 7, 15 ou 30 dias.", days };
  const holder = crypto.randomUUID();
  if (!(await acquire(worldId, holder))) return { ok: false, message: "O mundo está processando outro avanço. Tente em instantes.", days };
  try {
    const state = await loadState(worldId);
    const me = [...state.t.persons.values()].find((x) => x.user_id === userId && x.status === "ACTIVE") ?? null;
    const clock = await clockStatus(worldId, me?.id ?? null);
    const before = snapshotOf(state, userId);
    const countryBefore = countryOf(state);
    const expected = state.world.tick;
    const now = new Date().toISOString();
    // o relógio automático alcança o presente primeiro; o avanço manual conta a partir daí
    const caughtUp = Math.max(targetTick(state, now), state.world.tick);
    const manualFrom = addDays(state.world.game_date, caughtUp - state.world.tick);
    const plan = planAdvance(state, clock, manualFrom, days);
    if (!plan.ok) return { ok: false, message: plan.message ?? "O relógio compartilhado não permite avançar agora.", days: 0 };
    const from = state.world.game_date;
    const { ctx, ticks } = runTicks(state, { target: caughtUp + plan.days, maxTicks: MAX_CATCHUP + plan.days, budgetMs: 40_000, now: () => Date.now() });
    const manual = Math.max(0, state.world.tick - caughtUp);
    state.world.anchor_tick = state.world.tick;
    state.world.anchor_real_at = now;
    ctx.saveWorld();
    // registro público do avanço (cota por hora) e aviso a quem também está jogando
    ctx.emit("TIME_ADVANCED", { actors: me ? [me.id] : [], geography: "BR", payload: { days: manual, from: manualFrom, to: state.world.game_date } });
    if (me && manual > 0) {
      for (const id of clock.others) {
        ctx.notify(id, "Outro jogador passou o tempo", `${me.name} avançou o relógio do mundo em ${manual === 1 ? "1 dia" : `${manual} dias`}: agora é ${formatDatePt(state.world.game_date)}. Veja no Painel o que mudou.`, "/jogo/");
      }
    }
    await persist(worldId, ctx.changes, expected);
    cache.set(worldId, { state, at: Date.now() });
    const news = ctx.changes.get("news_articles").filter((n) => n.visibility === "PUBLIC" || n.user_id === userId);
    const headlines = news
      .sort((a, b) => b.importance - a.importance || b.tick - a.tick)
      .slice(0, 16)
      .map((n) => ({ headline: n.headline, lede: firstSentence(n.body), category: n.category, date: n.game_date, factual: n.factual, importance: n.importance }));
    const notifications = ctx.changes
      .get("notifications")
      .filter((n) => n.user_id === userId)
      .map((n) => ({ title: n.title, body: n.body, link: n.link }));
    const note = plan.stop && manual === plan.days ? `O relógio parou na véspera do ${plan.stop.label}: com outros jogadores no mundo, os marcos esperam ${MILESTONE_HOLD_MIN} min antes de serem cruzados.` : undefined;
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
      note,
    };
  } finally {
    await rpc("sim_release", { p_world: worldId, p_holder: holder }).catch(() => undefined);
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
  /** dia de votação no período: a apuração da disputa que importa ao jogador */
  apuracao?: Apuracao;
  /** acontecimentos esperando resposta (os que seguram o tempo primeiro) */
  pending?: StoryEvent[];
  /** dias pedidos e dias que ainda faltam (o relógio retoma daí depois da decisão) */
  requested?: number;
  remaining?: number;
}

function activePlayer(state: WorldState, userId: string) {
  return [...state.t.persons.values()].find((x) => x.user_id === userId && x.status === "ACTIVE" && x.kind === "PLAYER") ?? null;
}

/** Um candidato na apuração. */
export interface CountRow {
  id: string;
  name: string;
  party: string;
  color: string;
  votes: number;
  share: number;
  me: boolean;
  /** resultado final: eleito, vai ao 2º turno ou não */
  outcome: "ELEITO" | "SEGUNDO_TURNO" | "NAO";
}

/** Apuração de uma disputa no dia da votação, para a tela acompanhar a contagem. */
export interface Apuracao {
  date: string;
  title: string;
  round: 1 | 2;
  majoritarian: boolean;
  valid: number;
  seats: number;
  rows: CountRow[];
  /** a disputa é a do jogador */
  mine: boolean;
}

/**
 * Disputa a mostrar na apuração de um dia de votação que caiu no período:
 * a do jogador; se ele não concorre, a mais importante para ele (Presidência
 * nas gerais, prefeitura da cidade nas municipais).
 */
function apuracaoOf(state: WorldState, personId: string, from: string, to: string): Apuracao | undefined {
  const me = state.t.persons.get(personId);
  if (!me) return undefined;
  for (const e of state.t.elections.values()) {
    const round: 1 | 2 | null = e.first_round > from && e.first_round <= to ? 1 : e.runoff > from && e.runoff <= to ? 2 : null;
    if (!round) continue;
    const races = [...state.t.races.values()].filter((r) => r.election_id === e.id);
    const myCand = [...state.t.candidacies.values()].find((c) => c.election_id === e.id && c.person_id === personId && c.status !== "PRE" && c.status !== "DESISTENTE" && c.status !== "INDEFERIDA");
    const city = canonicalGeo(me.municipality);
    const race =
      (myCand && races.find((r) => r.id === myCand.race_id)) ??
      (e.kind === "GERAL" ? races.find((r) => r.office_code === "PRESIDENTE") : races.find((r) => r.office_code === "PREFEITO" && r.geo === city) ?? races.find((r) => r.office_code === "PREFEITO" && r.geo.startsWith(me.uf)));
    const res = round === 2 ? race?.results.runoff : race?.results.first;
    if (!race || !res?.candidates.length) continue;
    const majoritarian = OFFICES[race.office_code].system === "MAJORITARIO";
    const elected = new Set(race.results.elected ?? []);
    const sorted = [...res.candidates].sort((a, b) => b.votes - a.votes);
    const top = sorted.slice(0, majoritarian ? 6 : 10);
    const mine = sorted.find((c) => c.person_id === personId);
    if (mine && !top.includes(mine)) top.push(mine);
    const goesRunoff = majoritarian && round === 1;
    const rows: CountRow[] = top.map((c) => {
      const party = state.t.parties.get(c.party_id);
      const cand = state.t.candidacies.get(c.candidacy_id);
      return {
        id: c.candidacy_id,
        name: c.name,
        party: party?.acronym ?? "",
        color: party?.color ?? "#64748b",
        votes: Math.round(c.votes),
        share: c.share,
        me: c.person_id === personId,
        outcome: elected.has(c.candidacy_id) || elected.has(c.person_id) || cand?.status === "ELEITO" ? "ELEITO" : goesRunoff && cand?.status === "SEGUNDO_TURNO" ? "SEGUNDO_TURNO" : "NAO",
      };
    });
    const place = geoName(race.geo, new Ctx(state, "read").s);
    return {
      date: round === 2 ? e.runoff : e.first_round,
      title: `${OFFICES[race.office_code].name} · ${place}`,
      round,
      majoritarian,
      valid: Math.round(res.valid),
      seats: race.seats,
      rows,
      mine: !!myCand,
    };
  }
  return undefined;
}

/**
 * Passar o tempo vivendo cada dia: o relógio automático alcança o presente
 * (sem acontecimentos sorteados) e então os dias pedidos passam um a um para o
 * jogador, parando quando surge uma decisão que segura o tempo. A tela anima
 * o diário e, depois da resposta, pede o resto dos dias.
 */
export async function advanceStep(worldId: string, days: number, userId: string): Promise<StepAdvanceResult> {
  if (!Number.isInteger(days) || days < 1 || days > 31) return { ok: false, message: "Escolha entre 1 e 31 dias.", days: 0 };
  const holder = crypto.randomUUID();
  if (!(await acquire(worldId, holder))) return { ok: false, message: "O mundo está processando outro avanço. Tente em instantes.", days: 0 };
  try {
    const state = await loadState(worldId);
    const me = activePlayer(state, userId);
    if (!me) return { ok: false, message: "Você não tem personagem ativo neste mundo.", days: 0, stop: "fim" };
    const clock = await clockStatus(worldId, me.id);
    const before = snapshotOf(state, userId);
    const countryBefore = countryOf(state);
    const expected = state.world.tick;
    const now = new Date().toISOString();
    const caughtUp = Math.max(targetTick(state, now), state.world.tick);
    const manualFrom = addDays(state.world.game_date, caughtUp - state.world.tick);
    const plan = planAdvance(state, clock, manualFrom, days);
    if (!plan.ok) return { ok: false, message: plan.message ?? "O relógio compartilhado não permite avançar agora.", days: 0 };
    const from = state.world.game_date;
    // 1) o relógio automático alcança o presente
    const auto = runTicks(state, { target: caughtUp, maxTicks: MAX_CATCHUP, budgetMs: 12_000, now: () => Date.now() });
    // 2) os dias vividos pelo jogador, um a um
    const step = stepDays(state, me.id, { days: plan.days, budgetMs: 30_000, now: () => Date.now() });
    const manual = step.ticks;
    state.world.anchor_tick = state.world.tick;
    state.world.anchor_real_at = now;
    step.ctx.saveWorld();
    if (manual > 0) {
      step.ctx.emit("TIME_ADVANCED", { actors: [me.id], geography: "BR", payload: { days: manual, from: manualFrom, to: state.world.game_date } });
      for (const id of clock.others) {
        step.ctx.notify(id, "Outro jogador passou o tempo", `${me.name} avançou o relógio do mundo em ${manual === 1 ? "1 dia" : `${manual} dias`}: agora é ${formatDatePt(state.world.game_date)}. Veja no Painel o que mudou.`, "/jogo/");
      }
    }
    const changes = new Changes();
    changes.merge(auto.ctx.changes);
    changes.merge(step.ctx.changes);
    await persist(worldId, changes, expected);
    cache.set(worldId, { state, at: Date.now() });
    const news = changes.get("news_articles").filter((n) => n.visibility === "PUBLIC" || n.user_id === userId);
    const headlines = news
      .sort((a, b) => b.importance - a.importance || b.tick - a.tick)
      .slice(0, 16)
      .map((n) => ({ headline: n.headline, lede: firstSentence(n.body), category: n.category, date: n.game_date, factual: n.factual, importance: n.importance }));
    const notifications = changes
      .get("notifications")
      .filter((n) => n.user_id === userId)
      .map((n) => ({ title: n.title, body: n.body, link: n.link }));
    const held = plan.stop && manual === plan.days && plan.days < days;
    return {
      ok: true,
      message: `${manual} dia(s) vivido(s).`,
      days: auto.ticks + manual,
      from,
      to: state.world.game_date,
      headlines,
      newsCount: news.length,
      notifications,
      before,
      after: snapshotOf(state, userId),
      country: { before: countryBefore, after: countryOf(state) },
      note: held ? `O relógio parou na véspera do ${plan.stop!.label}: com outros jogadores no mundo, os marcos esperam ${MILESTONE_HOLD_MIN} min antes de serem cruzados.` : undefined,
      diary: step.days,
      stop: step.stop,
      stopOn: step.stopOn,
      apuracao: manual > 0 ? apuracaoOf(state, me.id, manualFrom, state.world.game_date) : undefined,
      pending: pendingFor(state, me.id),
      requested: days,
      remaining: held ? 0 : Math.max(0, plan.days - manual),
    };
  } finally {
    await rpc("sim_release", { p_world: worldId, p_holder: holder }).catch(() => undefined);
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
  return { ...r, pending: personId ? pendingFor(state, personId) : [], ended: !!st?.story?.ended, stage };
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

export interface AdminWorld {
  id: string;
  game_date: string;
  tick: number;
  anchor_real_at: string;
  speed: number;
  persons: number;
  players: number;
  players_24h: number;
  players_7d: number;
  actions_24h: number;
  advances_24h: number;
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
  unconfirmed: number;
  errors_24h: number;
  errors_7d: number;
  errors: Array<{ at: string; source: string; path: string | null; message: string; digest: string | null }>;
  tables: Array<{ name: string; bytes: number }>;
  worlds: AdminWorld[];
}

/** Números agregados para o painel de saúde (só para administradores). */
export function adminOverview(): Promise<AdminOverview> {
  return rpc<AdminOverview>("admin_overview", {});
}

/** Mede quanto tempo leva para carregar um mundo inteiro e quantos dias o relógio está atrasado. */
export async function probeWorld(worldId: string): Promise<{ loadMs: number; lagDays: number }> {
  const t0 = Date.now();
  const state = await loadState(worldId);
  const loadMs = Date.now() - t0;
  return { loadMs, lagDays: Math.max(0, targetTick(state, new Date().toISOString()) - state.world.tick) };
}

export { reportError as logError } from "./report-error";

export interface MaintenanceResult {
  news: number;
  events: number;
  notifications: number;
  /** donos de mundos próprios parados, a avisar por e-mail */
  warn: Array<{ world: string; email: string; last_active: string; delete_after: string }>;
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
