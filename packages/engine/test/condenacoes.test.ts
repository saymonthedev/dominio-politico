import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, dailyCrime, openInvestigation, type PersonRow, type WorldState } from "../src";
import { freshWorld } from "./helpers";

/** Leva o caso da investigação ao processo (réu) no dia de hoje. */
function toTrial(state: WorldState, p: PersonRow, evidence = 0.6) {
  const inv = openInvestigation(new Ctx(state, "tick"), p, { authority: "PF", initialEvidence: evidence, actIds: [], reason: "teste" })!;
  inv.stage = "INVESTIGACAO";
  inv.next_step_on = state.world.game_date;
  dailyCrime(new Ctx(state, "tick"));
  return inv;
}

describe("condenações de personagens fictícios", () => {
  it("o réu fictício contrata defesa conforme o dinheiro; o jogador continua montando a dele", () => {
    const { state } = freshWorld("npc-defesa");
    const [poor, rich] = [...state.t.persons.values()].filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE").slice(0, 2);
    state.t.person_states.get(poor.id)!.money = 0;
    state.t.person_states.get(poor.id)!.dirty_money = 0;
    state.t.person_states.get(rich.id)!.money = 50_000_000;
    const a = toTrial(state, poor);
    const b = toTrial(state, rich);
    expect(a.stage).toBe("PROCESSO");
    expect(b.stage).toBe("PROCESSO");
    expect(a.defense).toBeGreaterThanOrEqual(0.25);
    expect(a.defense).toBeLessThanOrEqual(0.4);
    expect(b.defense).toBeGreaterThan(a.defense);
    expect(b.defense).toBeLessThanOrEqual(0.9);

    const me = createCharacter(new Ctx(state, "action:setup"), { userId: "00000000-0000-0000-0000-000000000074", name: "Réu Teste", uf: "CE", age: 40, profession: "advogado", origin: "classe_media", interests: [], ideology: {} }).person!;
    const mine = toTrial(state, me);
    expect(mine.stage).toBe("PROCESSO");
    expect(mine.defense).toBe(0);
  });
});
