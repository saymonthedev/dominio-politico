import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, missionsView, performAction, weekOf } from "../src";
import { freshWorld } from "./helpers";

describe("missões da semana (retenção)", () => {
  it("três ações na comunidade cumprem a missão principal, pagam energia e a semana vira", () => {
    const { state } = freshWorld("missoes");
    const r = createCharacter(new Ctx(state, "action:m"), { userId: "00000000-0000-0000-0000-0000000000a1", name: "Missionária Teste", uf: "BA", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
    const me = r.person!;
    const st = state.t.person_states.get(me.id)!;
    expect(missionsView(me, st, state.world.game_date).items.every((x) => x.count === 0)).toBe(true);
    let last = "";
    for (let i = 0; i < 3; i++) {
      st.energy = 100;
      const res = performAction(new Ctx(state, `action:m${i}`), me.id, "trabalhar", {});
      expect(res.ok, res.message).toBe(true);
      last = res.message;
    }
    const v = missionsView(me, st, state.world.game_date);
    expect(v.items.find((x) => x.id === "principal")).toMatchObject({ count: 3, done: true });
    expect(last).toContain("Missão da semana cumprida");
    // na semana seguinte, tudo recomeça
    const next = new Date(`${weekOf(state.world.game_date)}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 7);
    expect(missionsView(me, st, next.toISOString().slice(0, 10)).items.every((x) => x.count === 0)).toBe(true);
  });
});
