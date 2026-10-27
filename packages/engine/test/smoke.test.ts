import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, performAction, runTicks } from "../src";
import { freshWorld } from "./helpers";

describe("simulação longa", () => {
  it("roda o mundo de 2026 até depois da eleição de 2030", () => {
    const { state } = freshWorld("smoke");
    const t0 = Date.now();
    const ctx = new Ctx(state, "action:setup");
    const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000001", name: "Joana Teste", uf: "SP", age: 35, profession: "professor", origin: "classe_media", interests: [], ideology: { economy: -20 } });
    expect(r.ok).toBe(true);
    const out = performAction(ctx, r.person!.id, "evento_local");
    expect(out.ok).toBe(true);
    let news = 0;
    let total = 0;
    while (state.world.game_date < "2031-03-01") {
      const { ctx: c, ticks } = runTicks(state, { target: state.world.tick + 60, maxTicks: 60 });
      news += c.changes.get("news_articles").length;
      total += ticks;
      if (c.policyLog.length) console.log("policy", c.policyLog.slice(0, 3));
    }
    const ms = Date.now() - t0;
    console.log(`ticks=${total} ms=${ms} (${(ms / total).toFixed(2)} ms/tick) news=${news}`);
    const e2028 = state.t.elections.get("e2028")!;
    const e2030 = state.t.elections.get("e2030")!;
    expect(e2028.status).toBe("ENCERRADA");
    expect(e2030.status).toBe("ENCERRADA");
    const pres = [...state.t.races.values()].find((x) => x.id === "e2030:PRESIDENTE:BR")!;
    console.log("2030 presidente 1º turno:", pres.results.first?.candidates.slice(0, 5).map((c) => `${c.name} ${c.share}%`));
    console.log("2030 2º turno:", pres.results.runoff?.candidates.map((c) => `${c.name} ${c.share}%`));
    const president = state.t.persons.get(state.world.gov.president_id!);
    console.log("presidente em 2031:", president?.name, president?.kind);
    const sp = [...state.t.races.values()].find((x) => x.id === "e2028:PREFEITO:3550308")!;
    console.log("SP 2028:", (sp.results.runoff ?? sp.results.first)?.candidates.map((c) => `${c.name} ${c.share}%`));
    const camara = [...state.t.parties.values()].map((p) => [p.acronym, p.seats.camara ?? 0] as const).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    console.log("Câmara 2031:", camara.slice(0, 10).map(([a, n]) => `${a}:${n}`).join(" "), "total", camara.reduce((s, [, n]) => s + n, 0));
    console.log("economia:", JSON.stringify(state.economy));
    console.log("investigações:", state.t.investigations.size, "atos ilícitos:", state.t.illicit_acts.size);
    expect(camara.reduce((s, [, n]) => s + n, 0)).toBe(513);
  }, 300_000);
});
