import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, dailyCrime, openInvestigation, performAction } from "../src";
import { freshWorld } from "./helpers";

describe("julgamento com ampla defesa", () => {
  it("réu tem data de julgamento, monta a defesa, ouve a sentença explicada e pode recorrer à 2ª instância", () => {
    const { state } = freshWorld("justica");
    const ctx = new Ctx(state, "action:setup");
    const p = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000093", name: "Igor Teste", uf: "PI", age: 40, profession: "advogado", origin: "classe_media", interests: [], ideology: {} }).person!;
    const st = state.t.person_states.get(p.id)!;
    st.money = 2_000_000;
    const inv = openInvestigation(new Ctx(state, "tick"), p, { authority: "PF", initialEvidence: 0.5, actIds: [], reason: "teste" })!;
    const act = (n: number, id: string, params: Record<string, string> = {}) => {
      st.energy = 100;
      return performAction(new Ctx(state, `action:${p.id}:${n}`), p.id, id, params);
    };
    // sem julgamento marcado, as ações do julgamento não valem
    expect(act(1, "juntar_provas").ok).toBe(false);

    // vira réu: o julgamento ganha data
    inv.stage = "INVESTIGACAO";
    inv.next_step_on = state.world.game_date;
    dailyCrime(new Ctx(state, "tick"));
    expect(inv.stage).toBe("PROCESSO");
    expect(inv.measures.some((m) => m.kind === "JULGAMENTO")).toBe(true);
    expect(inv.next_step_on > state.world.game_date).toBe(true);

    // a defesa: advogado (só melhora), provas (uma vez), testemunhas e nulidade
    const d0 = inv.defense;
    expect(act(2, "contratar_defesa", { advogado: "renomado" }).ok).toBe(true);
    expect(inv.defense).toBeCloseTo(d0 + 0.3, 5);
    expect(act(3, "contratar_defesa", { advogado: "escritorio" }).ok).toBe(false);
    expect(act(4, "juntar_provas").ok).toBe(true);
    expect(act(5, "juntar_provas").ok).toBe(false);
    expect(act(6, "arrolar_testemunhas").ok).toBe(true);
    expect(act(7, "pedir_nulidade").ok).toBe(true);
    expect(inv.measures.filter((m) => m.kind === "DEFESA").map((m) => m.tag).sort()).toEqual(["advogado:renomado", "nulidade", "provas", "testemunhas"]);

    // dia do julgamento: com provas muito fortes, condenação, e a sentença diz o peso de cada lado
    inv.evidence = 1;
    state.world.game_date = inv.next_step_on;
    dailyCrime(new Ctx(state, "tick"));
    expect(inv.outcome).toBe("CONDENADO");
    expect(inv.measures.find((m) => m.kind === "SENTENCA")?.text).toMatch(/provas da acusação \(\d+%\) e a defesa \(\d+%, com advogado/);

    // recurso: a 2ª instância revê e, com as provas enfraquecidas, absolve e desfaz a pena
    expect(act(8, "recorrer").ok).toBe(true);
    expect(act(9, "recorrer").ok).toBe(false);
    const repBefore = p.reputation;
    inv.evidence = 0.2;
    state.world.game_date = inv.next_step_on;
    dailyCrime(new Ctx(state, "tick"));
    expect(inv.measures.some((m) => m.kind === "SEGUNDA_INSTANCIA")).toBe(true);
    expect(inv.outcome).toBe("ABSOLVIDO");
    expect(inv.sentence).toBeNull();
    expect(st.jailed_until ?? null).toBeNull();
    expect(p.reputation).toBeGreaterThan(repBefore);
  });
});
