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
  Changes,
  clearPlayerData,
  createInitialWorld,
  MILESTONE_HOLD_MIN,
  planAdvance,
  SHARED_DAYS_PER_HOUR,
  Ctx,
  DEFAULT_RULESET,
  emptyTables,
  formatDatePt,
  hydrateState,
  runTicks,
  STATEFUL_TABLES,
  START_YEARS,
  targetTick,
  type CityBase,
  type ClockAdvance,
  type ClockStatus,
  type EconomyRow,
  type WorldRow,
  type WorldState,
} from "@dp/engine";
import { simSecret, SUPABASE_KEY, SUPABASE_URL } from "./env";

export const WORLD_VERSION = "v1";
export const worldIdFor = (year: number) => `br${year}`;
export const yearOfWorld = (id: string) => Number(id.replace(/^br/, ""));
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
  if (error) throw new SimDbError(fn, error.code, error.message);
  return data as T;
}

export async function worldExists(year: number): Promise<boolean> {
  const { data } = await db().from("worlds").select("id").eq("id", worldIdFor(year)).maybeSingle();
  return !!data;
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

/** Cria o mundo de um ponto de partida (idempotente: a seed é fixa por ano). */
export async function ensureWorld(year: number): Promise<void> {
  if (!isStartYear(year)) throw new Error("Ponto de partida inválido");
  if (await worldExists(year)) return;
  const snap = await loadSnapshot(year);
  const cities = await citiesFor(year);
  const { state, changes } = createInitialWorld(snap, {
    cities: [...cities.values()],
    worldId: worldIdFor(year),
    seed: `dominio-politico-${year}-${WORLD_VERSION}`,
    startRealAt: new Date().toISOString(),
    gameDaysPerRealHour: SPEED,
    name: `Brasil pós-${year}`,
  });
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
  return hydrateState({ world: data.world, economy: data.economy, ruleset: DEFAULT_RULESET, t, cities: await citiesFor(yearOfWorld(worldId)) });
}

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
export async function fastForward(year: number, days: number, userId: string): Promise<FastForwardResult> {
  if (!ALLOWED_DAYS.has(days)) return { ok: false, message: "Escolha 1, 7, 15 ou 30 dias.", days };
  const worldId = worldIdFor(year);
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

/** Exclusão de conta: o motor limpa os dados do jogador em cada mundo antes de o banco anonimizar o personagem. */
export async function clearPlayerWorlds(chars: Array<{ world_id: string; person_id: string }>): Promise<void> {
  for (const c of chars) {
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
