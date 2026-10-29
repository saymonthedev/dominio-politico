/**
 * Teste de integração contra o Supabase real (usa SIM_SECRET do .env.local).
 * Cria (se preciso) o mundo de 2026, um personagem de teste, executa ações e avança 15 dias.
 * Uso: npx tsx --env-file=.env.local scripts/integration.ts
 */
import { createCharacter, performAction } from "@dp/engine";
import { ensureWorld, fastForward, loadState, withWorld, worldIdFor } from "../lib/sim";

const YEAR = Number(process.env.TEST_YEAR ?? 2026);
const USER = process.env.TEST_USER_ID ?? "00000000-0000-4000-8000-000000000001";

async function main() {
  let t = Date.now();
  await ensureWorld(YEAR);
  console.log(`ensureWorld ${YEAR}: ${Date.now() - t} ms`);
  t = Date.now();
  const s0 = await loadState(worldIdFor(YEAR));
  console.log(`loadState: ${Date.now() - t} ms · pessoas ${s0.t.persons.size} · partidos ${s0.t.parties.size} · tick ${s0.world.tick} · ${s0.world.game_date}`);
  let me = [...s0.t.persons.values()].find((p) => p.user_id === USER);
  if (!me) {
    const { result } = await withWorld(worldIdFor(YEAR), (state, mk) =>
      createCharacter(mk(`novo-${USER}`), { userId: USER, name: "Personagem de Teste", uf: "SP", age: 34, profession: "professor", origin: "classe_media", interests: [], ideology: { economy: -10, social: -20 } }),
    );
    console.log("createCharacter:", result?.ok, result?.error ?? result?.person?.id);
    me = result?.person;
  }
  if (!me) throw new Error("sem personagem");
  for (const [action, params] of [["trabalhar", {}], ["evento_local", {}], ["reuniao_partidaria", { party: "pty_13" }]] as const) {
    t = Date.now();
    const { result } = await withWorld(worldIdFor(YEAR), (state, mk) => performAction(mk(me!.id), me!.id, action, params as Record<string, string>));
    console.log(`${action}: ${result?.ok} · ${result?.message} (${Date.now() - t} ms)`);
  }
  t = Date.now();
  const ff = await fastForward(worldIdFor(YEAR), 15, USER);
  console.log(`fastForward: ${ff.ok} ${ff.message} ${ff.from} → ${ff.to} (${Date.now() - t} ms)`);
  for (const h of ff.headlines ?? []) console.log("  ·", h.date, h.headline);
  const s1 = await loadState(worldIdFor(YEAR));
  const st = s1.t.person_states.get(me.id)!;
  console.log("energia após avanço:", st.energy, "· tick", s1.world.tick, s1.world.game_date);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
