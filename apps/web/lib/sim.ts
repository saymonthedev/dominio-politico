/**
 * Ponte entre o motor (@dp/engine) e o banco. Só roda no servidor.
 * O motor decide o que acontece; aqui só carregamos estado, avançamos o
 * relógio do mundo, aplicamos ações e gravamos as mudanças.
 */
import { createClient } from "@supabase/supabase-js";
import { loadCities, loadSnapshot } from "@dp/data";
import {
  Changes,
  createInitialWorld,
  Ctx,
  DEFAULT_RULESET,
  emptyTables,
  runTicks,
  STATEFUL_TABLES,
  START_YEARS,
  targetTick,
  type CityBase,
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
const CHUNK_ROWS = 700;

function db() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, { p_secret: simSecret(), ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
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

/** Grava as mudanças em lotes; a linha do mundo vai por último, com checagem de tick. */
export async function persist(worldId: string, changes: Changes, expectedTick: number | null): Promise<void> {
  const json = changes.toJSON();
  const worldRows = json.worlds ?? [];
  delete json.worlds;
  let batch: Record<string, unknown[]> = {};
  let count = 0;
  const flush = async () => {
    if (!count) return;
    await rpc("sim_apply", { p_world: worldId, p_changes: batch, p_expected_tick: null });
    batch = {};
    count = 0;
  };
  for (const [table, rows] of Object.entries(json)) {
    for (let i = 0; i < rows.length; i += CHUNK_ROWS) {
      const slice = rows.slice(i, i + CHUNK_ROWS);
      if (count + slice.length > CHUNK_ROWS) await flush();
      batch[table] = [...(batch[table] ?? []), ...slice];
      count += slice.length;
    }
  }
  await flush();
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

export async function loadState(worldId: string): Promise<WorldState> {
  const data = await rpc<LoadedJson | null>("sim_load", { p_world: worldId });
  if (!data) throw new Error("Mundo não encontrado");
  const t = emptyTables();
  for (const name of STATEFUL_TABLES) {
    const map = t[name] as Map<string, unknown>;
    for (const row of (data[name] ?? []) as Array<{ id: string }>) map.set(row.id, row);
  }
  return { world: data.world, economy: data.economy, ruleset: DEFAULT_RULESET, t, cities: await citiesFor(yearOfWorld(worldId)) };
}

const cache = new Map<string, { state: WorldState; at: number }>();

/** Estado recente (até 20 s) para telas que só leem disponibilidade de ações. */
export async function cachedState(worldId: string): Promise<WorldState> {
  const hit = cache.get(worldId);
  if (hit && Date.now() - hit.at < 20_000) return hit.state;
  const state = await loadState(worldId);
  cache.set(worldId, { state, at: Date.now() });
  return state;
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

/**
 * "Avançar o tempo": processa N dias imediatamente e reancora o relógio real
 * no novo dia (o relógio automático continua dali). Vale para todo o mundo.
 * Não há intervalo mínimo: o lease do mundo já impede dois avanços ao mesmo tempo.
 */
export async function fastForward(year: number, days: number, userId: string): Promise<FastForwardResult> {
  if (!ALLOWED_DAYS.has(days)) return { ok: false, message: "Escolha 1, 7, 15 ou 30 dias.", days };
  const worldId = worldIdFor(year);
  const holder = crypto.randomUUID();
  if (!(await acquire(worldId, holder))) return { ok: false, message: "O mundo está processando outro avanço. Tente em instantes.", days };
  try {
    const state = await loadState(worldId);
    const before = snapshotOf(state, userId);
    const countryBefore = countryOf(state);
    const expected = state.world.tick;
    const from = state.world.game_date;
    const now = new Date().toISOString();
    const caughtUp = targetTick(state, now);
    const target = Math.max(caughtUp, state.world.tick) + days;
    const { ctx, ticks } = runTicks(state, { target, maxTicks: MAX_CATCHUP + days, budgetMs: 40_000, now: () => Date.now() });
    state.world.anchor_tick = state.world.tick;
    state.world.anchor_real_at = now;
    ctx.saveWorld();
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
    return { ok: true, message: `${ticks} dia(s) processado(s).`, days: ticks, from, to: state.world.game_date, headlines, newsCount: news.length, notifications, before, after: snapshotOf(state, userId), country: { before: countryBefore, after: countryOf(state) } };
  } finally {
    await rpc("sim_release", { p_world: worldId, p_holder: holder }).catch(() => undefined);
  }
}
