/**
 * Ponte entre o motor (@dp/engine) e o banco. Só roda no servidor.
 * O motor decide o que acontece; aqui só carregamos estado, avançamos o
 * relógio do mundo, aplicamos ações e gravamos as mudanças.
 */
import { createClient } from "@supabase/supabase-js";
import { loadSnapshot } from "@dp/data";
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
  const { state, changes } = createInitialWorld(snap, {
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
  return { world: data.world, economy: data.economy, ruleset: DEFAULT_RULESET, t };
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
