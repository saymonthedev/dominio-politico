import { describe, expect, it } from "vitest";
import { checkAchievements, createCharacter, Ctx, resolveStory, STORY_DEFS, StoryCtx, storyOf, type MandateRow, type WorldState } from "../src";
import type { PersonRow, PersonStateRow } from "../src/types";
import { presidesHouse } from "../src/story/catalog/mesa";
import { freshWorld } from "./helpers";

/** Vereador(a) com mandato de 2025 a 2028: a Mesa do 2º biênio é eleita em 1º/1/2027. */
function vereador(seed: string) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, {
    userId: "00000000-0000-0000-0000-000000000098",
    name: "Lia Teste",
    uf: "SC",
    age: 35,
    profession: "professor",
    origin: "classe_media",
    interests: [],
    ideology: { economy: 0 },
  });
  expect(r.ok, r.error).toBe(true);
  const p = r.person!;
  const st = state.t.person_states.get(p.id)!;
  p.office_code = "VEREADOR";
  p.office_geo = storyOf(st).home!.city;
  st.political_capital = 40;
  st.energy = 100;
  const m: MandateRow = { id: "man_mesa", world_id: state.world.id, person_id: p.id, office_code: "VEREADOR", geo: p.office_geo, start_on: "2025-01-01", end_on: "2028-12-31", status: "ATIVO", election_id: null, approval: 50 };
  state.t.mandates.set(m.id, m);
  return { state, p, st };
}

const story = (state: WorldState, p: PersonRow, st: PersonStateRow, key: string) => {
  const ctx = new Ctx(state, "tick");
  return new StoryCtx(ctx, p, st, ctx.rng(key, p.id));
};

/** Põe o acontecimento na caixa do jogador e responde. */
function answer(state: WorldState, p: PersonRow, st: PersonStateRow, def: string, data: Record<string, string | number>, choice: string) {
  const c = story(state, p, st, def);
  const id = `sty_${def}_${storyOf(st).pending.length}_${st.action_seq}`;
  storyOf(st).pending.push({
    id,
    def,
    on: state.world.game_date,
    expires: "2099-01-01",
    kind: STORY_DEFS[def].kind,
    blocking: true,
    tags: STORY_DEFS[def].tags,
    title: "t",
    text: "",
    choices: STORY_DEFS[def].render(c, data).choices.map((x) => ({ id: x.id, label: x.label })),
    data,
  });
  const r = resolveStory(new Ctx(state, `action:${p.id}:${st.action_seq}`), p.id, id, choice);
  expect(r.ok, r.message).toBe(true);
  return r;
}

const queued = (st: PersonStateRow, def: string) => storyOf(st).queue.find((q) => q.def === def);

describe("eleição da Mesa", () => {
  it("chama quem tem cadeira na Casa só na janela antes do biênio, com um rival fictício", () => {
    const { state, p, st } = vereador("mesa-janela");
    state.world.game_date = "2026-12-15";
    const b = STORY_DEFS.mesa_disputa.when(story(state, p, st, "a"));
    expect(b).toBeTruthy();
    expect(b!.casa).toBe("VEREADOR");
    expect(b!.d).toBe("2027-01-01");
    expect(Number(b!.odds)).toBeGreaterThanOrEqual(5);
    expect(state.t.persons.get(String(b!.rival))?.kind).toBe("FICTIONAL_GENERATED");
    // longe da eleição, ou sem mandato no dia, não aparece
    state.world.game_date = "2026-10-01";
    expect(STORY_DEFS.mesa_disputa.when(story(state, p, st, "b"))).toBeNull();
    state.world.game_date = "2026-12-15";
    state.t.mandates.get("man_mesa")!.end_on = "2026-12-31";
    expect(STORY_DEFS.mesa_disputa.when(story(state, p, st, "c"))).toBeNull();
  });

  it("candidatura, bloco e voto: quem vence preside dois anos, manda na pauta, distribui comissões e ganha pontos", () => {
    const { state, p, st } = vereador("mesa-fluxo");
    state.world.game_date = "2026-12-15";
    const b = STORY_DEFS.mesa_disputa.when(story(state, p, st, "a"))!;
    answer(state, p, st, "mesa_disputa", b, "lancar");
    const art = queued(st, "mesa_articulacao");
    expect(art?.due).toBe("2026-12-28");

    state.world.game_date = art!.due;
    expect(STORY_DEFS.mesa_articulacao.when(story(state, p, st, "b"), art!.data)).toBeTruthy();
    answer(state, p, st, "mesa_articulacao", art!.data, "centro");
    const vote = queued(st, "mesa_votacao");
    expect(vote?.due).toBe("2027-01-01");
    expect(Number(vote!.data.odds)).toBe(Math.min(85, Number(b.odds) + 16));

    // no dia, com a contagem no máximo (85%), até vencer
    state.world.game_date = "2027-01-01";
    expect(STORY_DEFS.mesa_votacao.when(story(state, p, st, "c"), vote!.data)).toBeTruthy();
    for (let i = 0; i < 15 && !storyOf(st).flags.mesa_pres; i++) answer(state, p, st, "mesa_votacao", { ...vote!.data, odds: 100 }, "ok");
    expect(storyOf(st).flags.mesa_pres).toBe("VEREADOR|2029-01-01");
    expect(storyOf(st).flags.mesa_presidiu).toBe("VEREADOR");

    state.world.game_date = "2027-06-01";
    expect(presidesHouse(story(state, p, st, "d"))).toBe(true);
    // quem preside distribui as comissões em vez de disputar uma
    expect(STORY_DEFS.esc_presidencia_comissao.when(story(state, p, st, "e"))).toBeNull();
    expect(checkAchievements(new Ctx(state, "tick"), p)).toContain("presidente_casa");
    state.world.game_date = "2029-01-02";
    expect(presidesHouse(story(state, p, st, "f"))).toBe(false);
  });
});
