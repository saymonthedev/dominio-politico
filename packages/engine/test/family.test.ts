import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, familyOf, monthlyFamily, monthlyStatement, performAction } from "../src";
import { freshWorld } from "./helpers";

describe("família", () => {
  it("sorteia a mesma família, casa, tem filho, cobra as despesas e esfria sem convivência", () => {
    const { state } = freshWorld("familia");
    const ctx = new Ctx(state, "action:setup");
    const p = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000077", name: "Rita Teste", uf: "BA", age: 19, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
    const st = state.t.person_states.get(p.id)!;
    st.money = 200_000;
    const fam = familyOf(ctx, p, st);
    // aos 19 anos: pais, ninguém casado ainda (o casamento sorteado vem depois dos 23)
    expect(fam.map((m) => m.role).sort()).toEqual(["MAE", "PAI"]);
    expect(familyOf(new Ctx(state, "action:outra"), p, st)).toEqual(fam);

    const casar = performAction(new Ctx(state, `action:${p.id}:1`), p.id, "casar", { nome: "Joana Costa", festa: "simples" });
    expect(casar.ok).toBe(true);
    const spouse = familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!;
    expect(spouse.name).toBe("Joana Costa");
    expect(performAction(new Ctx(state, `action:${p.id}:2`), p.id, "casar", { nome: "Outra Pessoa", festa: "simples" }).ok).toBe(false);

    const filho = performAction(new Ctx(state, `action:${p.id}:3`), p.id, "ter_filho", { nome: "Lia" });
    expect(filho.ok).toBe(true);
    expect(familyOf(ctx, p, st).some((m) => m.role === "FILHO" && m.name.startsWith("Lia"))).toBe(true);
    expect(monthlyStatement(ctx, p, st).items.some((i) => i.kind === "FAMILIA" && i.amount < 0)).toBe(true);

    const before = familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!.bond;
    monthlyFamily(new Ctx(state, "tick:mes"));
    const after = familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!.bond;
    expect(after).toBeLessThan(before);

    const programa = performAction(new Ctx(state, `action:${p.id}:4`), p.id, "programa_a_dois", {});
    expect(programa.ok).toBe(true);
    expect(familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!.bond).toBeGreaterThan(after);
  });
});
