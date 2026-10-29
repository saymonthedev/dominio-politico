/**
 * Teste de integração do mundo próprio fictício contra o Supabase real (usa SIM_SECRET do .env.local).
 * Cria um mundo fictício de uma conta de teste, cria o personagem, avança 7 dias e apaga o mundo.
 * Uso: npx tsx --env-file=.env.local scripts/private-world.ts
 */
import { createCharacter, isFictional } from "@dp/engine";
import { dropWorld, ensureWorld, fastForward, loadState, withWorld, worldExists, worldIdFor } from "../lib/sim";

const YEAR = 2026;
const USER = "00000000-0000-4000-8000-0000000000f1";

async function main() {
  const id = worldIdFor(YEAR, "FICTIONAL", USER);
  let t = Date.now();
  await ensureWorld(YEAR, id);
  console.log(`ensureWorld ${id}: ${Date.now() - t} ms`);
  try {
    t = Date.now();
    const s = await loadState(id);
    const mayor = [...(s.cities?.values() ?? [])].find((c) => c.capital)?.mayor;
    console.log(`loadState: ${Date.now() - t} ms · fictício=${isFictional(s)} · velocidade=${s.world.game_days_per_real_hour} · partidos=${[...s.t.parties.values()].slice(0, 4).map((p) => p.acronym).join(", ")} · prefeito de capital=${mayor?.name} (${mayor?.party})`);
    const reais = [...s.t.persons.values()].filter((p) => p.kind.startsWith("REAL")).length;
    console.log(`pessoas reais restantes: ${reais}`);
    const { result } = await withWorld(id, (_st, mk) =>
      createCharacter(mk(`novo-${USER}`), { userId: USER, name: "Teste Ficção", uf: "BA", age: 35, profession: "professor", origin: "classe_media", interests: [], ideology: {} }),
    );
    console.log(`personagem: ${result?.ok}`);
    t = Date.now();
    const ff = await fastForward(id, 7, USER);
    console.log(`fastForward: ${ff.ok} ${ff.message} ${ff.from} → ${ff.to} (${Date.now() - t} ms)`);
    for (const h of (ff.headlines ?? []).slice(0, 4)) console.log("  ·", h.headline);
  } finally {
    t = Date.now();
    await dropWorld(id);
    console.log(`dropWorld: ${Date.now() - t} ms · ainda existe=${await worldExists(id)}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
