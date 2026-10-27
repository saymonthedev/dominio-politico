import { describe, expect, it } from "vitest";
import { cityNow, createCharacter, Ctx, runTicks } from "../src";
import { freshWorld } from "./helpers";

const SAO_PAULO = "3550308";
const CAMPINAS = "3509502";
const ADAMANTINA = "3500105";

describe("municípios", () => {
  it("parte dos dados reais: prefeito e câmara de São Paulo em 2026", () => {
    const { state } = freshWorld("cidades");
    const sp = cityNow(state, SAO_PAULO)!;
    expect(sp.name).toBe("São Paulo");
    expect(sp.mayor?.name).toBe("Ricardo Nunes");
    expect(sp.mayor?.partyLabel).toBe("MDB");
    expect(sp.mayor?.personId).toBeTruthy();
    expect(sp.council.reduce((s, c) => s + c.seats, 0)).toBe(55);
    expect(Object.keys(sp.president)).toContain("Lula");
  });

  it("cidade-base do jogador ganha disputa completa; as outras têm resultado calculado e reprodutível", () => {
    const run = () => {
      const { state } = freshWorld("cidades");
      const ctx = new Ctx(state, "action:setup");
      const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000002", name: "Ana Interior", uf: "SP", city: CAMPINAS, age: 40, profession: "professor", origin: "interior", interests: [], ideology: {} });
      expect(r.ok).toBe(true);
      expect(r.person!.municipality).toBe(CAMPINAS);
      while (state.world.game_date < "2029-01-10") runTicks(state, { target: state.world.tick + 90, maxTicks: 90 });
      return state;
    };
    const a = run();
    const race = a.t.races.get(`e2028:PREFEITO:${CAMPINAS}`);
    expect(race?.status).toBe("ENCERRADA");
    expect(a.t.races.has(`e2028:PREFEITO:${ADAMANTINA}`)).toBe(false);
    const camp = cityNow(a, CAMPINAS)!;
    expect(camp.mayor?.simulated).toBe(false);
    expect(camp.mayor?.electedIn).toBe(2028);
    const ad = cityNow(a, ADAMANTINA)!;
    expect(ad.mayor?.simulated).toBe(true);
    expect(ad.mayor?.electedIn).toBe(2028);
    expect(ad.council.reduce((s, c) => s + c.seats, 0)).toBe(cityNow(freshWorld("cidades").state, ADAMANTINA)!.council.reduce((s, c) => s + c.seats, 0));
    const b = run();
    expect(cityNow(b, ADAMANTINA)).toEqual(ad);
  }, 300_000);

  it("recusa cidade de outra UF", () => {
    const { state } = freshWorld("cidades");
    const r = createCharacter(new Ctx(state, "action:x"), { userId: "00000000-0000-0000-0000-000000000003", name: "Beto Errado", uf: "RJ", city: CAMPINAS, age: 30, profession: "professor", origin: "interior", interests: [], ideology: {} });
    expect(r.ok).toBe(false);
  });
});
