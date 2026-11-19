import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, joinParty, performAction, startView } from "../src";
import { freshWorld } from "./helpers";

const novo = (state: ReturnType<typeof freshWorld>["state"], userId: string, name: string) => {
  const r = createCharacter(new Ctx(state, `action:novo-${userId}`), { userId, name, uf: "PE", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
  return { me: r.person!, st: state.t.person_states.get(r.person!.id)! };
};

describe("missões de início (primeira hora)", () => {
  it("personagem novo ganha a recompensa de cada passo cumprido", () => {
    const { state } = freshWorld("inicio");
    const { me, st } = novo(state, "00000000-0000-4000-8000-0000000000b1", "Iniciante Teste");
    expect(st.story?.start).toEqual({ done: [] });
    expect(startView(me, st, state.world.tick).every((s) => !s.done)).toBe(true);

    // 1ª ação: cumpre "gaste energia" e paga +10 de energia na hora
    st.energy = 50;
    const r1 = performAction(new Ctx(state, "action:i1"), me.id, "trabalhar", {});
    expect(r1.ok, r1.message).toBe(true);
    expect(r1.message).toContain("Missão de início cumprida");
    expect(st.story?.start?.done).toEqual(["energia"]);

    // reunião aberta de partido: aproximação e +2 de capital político
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && [...state.t.persons.values()].some((q) => q.party_id === x.id && q.uf === me.uf && q.status === "ACTIVE" && q.kind !== "PLAYER"))!;
    st.energy = 100;
    const capital = st.political_capital;
    const r2 = performAction(new Ctx(state, "action:i2"), me.id, "reuniao_partidaria", { party: party.id });
    expect(r2.ok, r2.message).toBe(true);
    expect(me.stage).toBe("APROXIMACAO");
    expect(st.story?.start?.done).toContain("reuniao");
    expect(st.political_capital).toBeGreaterThanOrEqual(Math.min(100, capital + 2) - 0.001);

    // o partido aceita durante os dias (fora de uma ação): a recompensa vem na ação seguinte
    joinParty(new Ctx(state, "setup"), me, party);
    expect(startView(me, st, state.world.tick).find((s) => s.id === "partido")?.done).toBe(true);
    expect(st.story?.start?.done).not.toContain("partido");
    st.energy = 50;
    const r3 = performAction(new Ctx(state, "action:i3"), me.id, "trabalhar", {});
    expect(r3.ok, r3.message).toBe(true);
    expect(r3.message).toContain("+15 de energia, +3 de capital político");
    expect(st.story?.start?.done).toContain("partido");

    // nada é pago duas vezes
    st.energy = 50;
    const r4 = performAction(new Ctx(state, "action:i4"), me.id, "trabalhar", {});
    expect(r4.message).not.toContain("Missão de início");
  });

  it("personagem de antes das missões não recebe pelo que já tinha feito", () => {
    const { state } = freshWorld("inicio-antigo");
    const { me, st } = novo(state, "00000000-0000-4000-8000-0000000000b2", "Veterana Teste");
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO")!;
    joinParty(new Ctx(state, "setup"), me, party);
    st.action_seq = 40;
    const recorded = () => st.story?.start?.done ?? [];
    // como era antes: sem registro das missões de início
    st.story!.start = null;
    st.energy = 50;
    const before = st.energy;
    const r = performAction(new Ctx(state, "action:v1"), me.id, "trabalhar", {});
    expect(r.ok, r.message).toBe(true);
    expect(r.message).not.toContain("Missão de início");
    expect(recorded()).toEqual(expect.arrayContaining(["energia", "reuniao", "partido"]));
    expect(recorded()).not.toContain("pre");
    // a energia só caiu pelo custo da ação (nenhuma recompensa entrou)
    expect(st.energy).toBeLessThanOrEqual(before);
  });
});
