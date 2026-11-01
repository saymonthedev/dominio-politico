/**
 * Prova da atualização incremental do mundo (sim_world_delta) contra um banco de TESTES.
 * 1) lê o mundo inteiro (S1) na revisão R0;
 * 2) grava por fora: responde o que segura o tempo e vive alguns dias com o jogador;
 * 3) aplica em S1 só o que mudou desde R0;
 * 4) compara S1 linha a linha com uma carga completa nova (S2), o formato antigo (sim_load_part)
 *    com o novo (sim_world_part) e a memória de quem gravou com a carga completa.
 * Uso: npx tsx --env-file=<env do projeto de testes> scripts/delta-check.ts <mundo> <user_id do dono> [trechos] [dias]
 */
import { createClient } from "@supabase/supabase-js";
import { STATEFUL_TABLES, type WorldState } from "@dp/engine";
import { advanceStep, applyDelta, cachedState, decideStory, loadState } from "../lib/sim";

const [W, USER] = process.argv.slice(2, 4);
if (!W || !USER) throw new Error("uso: delta-check.ts <mundo> <user_id do dono> [trechos] [dias]");
const STEPS = Number(process.argv[4] ?? "3");
const DAYS = Number(process.argv[5] ?? "5");

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, { p_secret: process.env.SIM_SECRET, ...args });
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const canon = (v: unknown): unknown =>
  Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

function compare(label: string, a: WorldState, b: WorldState): number {
  let bad = 0;
  if (!same(a.world, b.world)) {
    bad++;
    const keys = Object.keys(b.world).filter((k) => !same((a.world as never)[k], (b.world as never)[k]));
    console.log(`  [${label}] world difere em: ${keys.join(", ")}`);
  }
  if (!same(a.economy, b.economy)) (bad++, console.log(`  [${label}] economy difere`));
  for (const name of STATEFUL_TABLES) {
    const ma = a.t[name] as Map<string, unknown>;
    const mb = b.t[name] as Map<string, unknown>;
    const onlyA = [...ma.keys()].filter((k) => !mb.has(k));
    const onlyB = [...mb.keys()].filter((k) => !ma.has(k));
    const diff = [...ma.keys()].filter((k) => mb.has(k) && !same(ma.get(k), mb.get(k)));
    if (onlyA.length || onlyB.length || diff.length) {
      bad++;
      console.log(`  [${label}] ${name}: ${ma.size} vs ${mb.size} · só em A ${onlyA.length} · só em B ${onlyB.length} · diferentes ${diff.length}`);
      if (diff[0]) {
        const ra = ma.get(diff[0]) as Record<string, unknown>;
        const rb = mb.get(diff[0]) as Record<string, unknown>;
        const keys = Object.keys({ ...ra, ...rb }).filter((k) => !same(ra[k], rb[k]));
        console.log(`     ex.: ${diff[0]} campos: ${keys.slice(0, 8).join(", ")}`);
      }
      if (onlyA[0]) console.log(`     ex. só em A: ${onlyA.slice(0, 3).join(", ")}`);
      if (onlyB[0]) console.log(`     ex. só em B: ${onlyB.slice(0, 3).join(", ")}`);
    }
  }
  console.log(`[${label}] ${bad ? `${bad} diferença(s)` : "IDÊNTICO"}`);
  return bad;
}

async function main() {
  let t = Date.now();
  const rev0 = Number(await rpc("world_rev", { p_world: W }));
  const s1 = await loadState(W);
  console.log(`S1 carregado (rev ${rev0}, tick ${s1.world.tick}) em ${Date.now() - t} ms`);

  for (let i = 0; i < STEPS; i++) {
    // responde o que estiver segurando o tempo (primeira escolha), como um jogador faria
    const me = [...s1.t.persons.values()].find((p) => p.user_id === USER && p.status === "ACTIVE");
    const now = await cachedState(W);
    for (const ev of (me ? now.t.person_states.get(me.id)?.story?.pending ?? [] : []).slice(0, 4)) {
      const c = ev.choices?.[0];
      if (!c) continue;
      t = Date.now();
      const r = await decideStory(W, USER, ev.id, c.id);
      console.log(`  decisão "${ev.title}": ${r.ok ? "ok" : "FALHOU " + r.message} em ${Date.now() - t} ms`);
    }
    t = Date.now();
    const r = await advanceStep(W, DAYS, USER);
    console.log(`  trecho ${i + 1}: ${r.ok ? "ok" : "FALHOU"} ${r.message} (${r.from} → ${r.to}) em ${Date.now() - t} ms`);
  }
  const rev1 = Number(await rpc("world_rev", { p_world: W }));

  t = Date.now();
  const d = await rpc<{ rev: number; full: boolean; tables?: Record<string, unknown[]> }>("sim_world_delta", { p_world: W, p_since: rev0 });
  const bytes = JSON.stringify(d).length;
  const rows = Object.values(d.tables ?? {}).reduce((s, x) => s + x.length, 0);
  console.log(`delta ${rev0}→${d.rev} (banco em ${rev1}): full=${d.full}, ${rows} linhas, ${(bytes / 1024).toFixed(0)} KB, ${Date.now() - t} ms`);
  console.log(`   por tabela: ${Object.entries(d.tables ?? {}).map(([k, v]) => `${k}=${v.length}`).join(" ")}`);
  if (d.full) throw new Error("delta pediu carga completa");
  applyDelta(s1, d as never);

  t = Date.now();
  const s2 = await loadState(W);
  const fullBytes = JSON.stringify({ t: Object.fromEntries(STATEFUL_TABLES.map((n) => [n, [...(s2.t[n] as Map<string, unknown>).values()]])) }).length;
  console.log(`S2 (carga completa) em ${Date.now() - t} ms, ~${(fullBytes / 1024).toFixed(0)} KB`);

  let bad = compare("delta vs carga completa", s1, s2);
  // formato antigo (jsonb, sim_load_part) e novo (json, sim_world_part): mesmas linhas
  const parts = ["core", "persons", "person_states", "parties", "elections", "mandates", "crime"];
  const [oldJson, newJson] = await Promise.all(
    ["sim_load_part", "sim_world_part"].map(async (fn) => Object.assign({}, ...(await Promise.all(parts.map((p) => rpc<Record<string, unknown>>(fn, { p_world: W, p_part: p }))))) as Record<string, unknown>),
  );
  let fmt = 0;
  for (const k of Object.keys(oldJson)) {
    const a = oldJson[k];
    const b = newJson[k];
    if (Array.isArray(a) && Array.isArray(b)) {
      const mb = new Map((b as Array<{ id: string }>).map((r) => [r.id, r]));
      const diff = (a as Array<{ id: string }>).filter((r) => !same(r, mb.get(r.id)));
      if (diff.length || a.length !== b.length) {
        fmt++;
        const r0 = diff[0] as Record<string, unknown> | undefined;
        const r1 = r0 ? (mb.get((r0 as { id: string }).id) as Record<string, unknown> | undefined) : undefined;
        const keys = r0 && r1 ? Object.keys({ ...r0, ...r1 }).filter((x) => !same(r0[x], r1[x])) : [];
        console.log(`  [jsonb vs json] ${k}: ${a.length} vs ${b.length}, ${diff.length} diferentes ${keys.length ? `(campos: ${keys.slice(0, 6).join(", ")}; ex.: ${JSON.stringify(r0?.[keys[0]])} vs ${JSON.stringify(r1?.[keys[0]])})` : ""}`);
      }
    } else if (!same(a, b)) (fmt++, console.log(`  [jsonb vs json] ${k} difere`));
  }
  console.log(`[formato antigo vs novo] ${fmt ? `${fmt} diferença(s)` : "IDÊNTICO"}`);
  bad += fmt;
  const writer = await cachedState(W);
  bad += compare("memória de quem gravou vs carga completa", writer, s2);

  // um delta sem mudanças: vazio
  const empty = await rpc<{ rev: number; full: boolean; tables?: Record<string, unknown[]> }>("sim_world_delta", { p_world: W, p_since: rev1 });
  console.log(`delta vazio: full=${empty.full} tabelas=${Object.keys(empty.tables ?? {}).length}`);
  // revisão anterior ao registro: pede carga completa
  const old = await rpc<{ full: boolean }>("sim_world_delta", { p_world: W, p_since: 0 });
  console.log(`delta de antes do registro: full=${old.full}`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
