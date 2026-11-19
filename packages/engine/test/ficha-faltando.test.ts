import { describe, expect, it } from "vitest";
import { addDays, Ctx, diffDays, partySwitchWindow, runTicks, tidyStates } from "../src";
import { freshWorld } from "./helpers";

/** Deputados com cargo e partido sem a ficha interna, como no mundo de 2002 em 19/11. */
function withoutStates(seed: string) {
  const { state } = freshWorld(seed);
  // até a posse de fevereiro de 2027: os deputados eleitos em 2026 com o cargo
  const days = diffDays("2027-02-03", state.world.game_date);
  runTicks(state, { target: state.world.tick + days, maxTicks: days });
  const deps = [...state.t.persons.values()].filter(
    (p) => p.kind !== "PLAYER" && p.status === "ACTIVE" && !!p.party_id && (p.office_code === "DEP_FEDERAL" || p.office_code === "DEP_ESTADUAL"),
  );
  for (const p of deps) state.t.person_states.delete(p.id);
  const e = [...state.t.elections.values()].find((x) => x.kind === "GERAL" && x.status !== "ENCERRADA")!;
  return { state, deps, e };
}

describe("personagem sem ficha interna (incidente de 18 e 19/11)", () => {
  it("a troca de partido na janela partidária não quebra e quem trocou ganha a ficha", () => {
    const { state, deps, e } = withoutStates("ficha-janela");
    expect(deps.length).toBeGreaterThan(500);
    expect(e).toBeTruthy();
    const before = new Map(deps.map((p) => [p.id, p.party_id]));
    let day = e.calendar.partySwitchWindowStart;
    for (let i = 0; i < 20; i++) {
      state.world.tick += 1;
      state.world.game_date = day;
      const ctx = new Ctx(state, "tick");
      expect(() => partySwitchWindow(ctx, e)).not.toThrow();
      day = addDays(day, 1);
    }
    const switched = deps.filter((p) => p.party_id !== before.get(p.id));
    expect(switched.length).toBeGreaterThan(0);
    for (const p of switched) {
      expect(p.party_id, p.name).toBeTruthy();
      expect(state.t.person_states.get(p.id)?.filiation_date, p.name).toBeTruthy();
    }
  });

  it("o começo do dia devolve a ficha a todos os personagens ativos e manda gravar", () => {
    const { state, deps } = withoutStates("ficha-dia");
    const { ctx } = runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    const saved = new Set(ctx.changes.get("person_states").map((s) => s.id));
    for (const p of deps) {
      expect(state.t.person_states.get(p.id), p.name).toBeTruthy();
      expect(saved.has(p.id), p.name).toBe(true);
    }
    // pessoa real: traços neutros e sem dinheiro, como no ponto de partida
    const real = deps.find((p) => p.kind === "REAL_ACTIVE_AT_SNAPSHOT")!;
    expect(real).toBeTruthy();
    expect(state.t.person_states.get(real.id)!.money).toBe(0);
    expect(state.t.person_states.get(real.id)!.traits.riskTolerance).toBe(0);
    expect(tidyStates(new Ctx(state, "tick"))).toBe(0);
  });

  it("os dias da janela partidária correm sem etapa pulada", () => {
    const { state, e } = withoutStates("ficha-calendario");
    state.world.game_date = addDays(e.calendar.partySwitchWindowStart, -1);
    const { ctx } = runTicks(state, { target: state.world.tick + 12, maxTicks: 12, tolerant: true });
    expect(ctx.faults.map((f) => `${f.step}: ${f.error.message}`)).toEqual([]);
  });
});
