import { describe, expect, it } from "vitest";
import { careerScore, checkAchievements, createCharacter, Ctx } from "../src";
import { freshWorld } from "./helpers";

describe("conquistas", () => {
  it("registra a conquista uma vez, com a data, e soma pontos de carreira", () => {
    const { state } = freshWorld("conquistas");
    const ctx = new Ctx(state, "action:setup");
    const p = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000066", name: "Davi Teste", uf: "PE", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
    const st = state.t.person_states.get(p.id)!;
    expect(checkAchievements(ctx, p)).toEqual([]);
    const before = careerScore(p, st);
    p.stage = "ATIVISTA";
    expect(checkAchievements(new Ctx(state, "action:a"), p)).toEqual(["ativista"]);
    expect(st.achievements.ativista).toBe(state.world.game_date);
    expect(checkAchievements(new Ctx(state, "action:b"), p)).toEqual([]);
    expect(careerScore(p, st)).toBeGreaterThan(before);
  });
});
