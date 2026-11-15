import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, familyOf, familyState, looksFemale, monthlyFamily, monthlyStatement, performAction, roleLabel } from "../src";
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

    const casar = performAction(new Ctx(state, `action:${p.id}:1`), p.id, "casar", { nome: "Joana Costa", quem: "esposa", festa: "simples" });
    expect(casar.ok).toBe(true);
    const spouse = familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!;
    expect(spouse.name).toBe("Joana Costa");
    expect(performAction(new Ctx(state, `action:${p.id}:2`), p.id, "casar", { nome: "Outra Pessoa", quem: "marido", festa: "simples" }).ok).toBe(false);

    const filho = performAction(new Ctx(state, `action:${p.id}:3`), p.id, "ter_filho", { nome: "Lia", sexo: "menina" });
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

  it("esposa ou marido, menina ou menino: o jogador escolhe; quem casou antes tem o nome lido direito e pode corrigir", () => {
    for (const n of ["Maria Clara", "Júlia", "Letícia Souza", "Alice", "Ingrid", "Thaís", "Ana"]) expect(looksFemale(n), n).toBe(true);
    for (const n of ["João Pedro", "Pedro", "Luca", "Felipe", "Davi", "Carlos"]) expect(looksFemale(n), n).toBe(false);

    const { state } = freshWorld("familia-genero");
    const ctx = new Ctx(state, "action:setup");
    const p = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000078", name: "Caio Teste", uf: "PE", age: 20, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
    const st = state.t.person_states.get(p.id)!;
    st.money = 200_000;
    const spouse = () => familyOf(ctx, p, st).find((m) => m.role === "CONJUGE")!;

    // a escolha vale mesmo com um nome que o jogo não conhece
    expect(performAction(new Ctx(state, `action:${p.id}:1`), p.id, "casar", { nome: "Kemilly Santos", festa: "simples" }).ok).toBe(false);
    expect(performAction(new Ctx(state, `action:${p.id}:2`), p.id, "casar", { nome: "Kemilly Santos", quem: "esposa", festa: "simples" }).ok).toBe(true);
    expect(roleLabel(spouse())).toBe("Esposa");

    // casamento de antes da correção (sem a escolha gravada): "Maria" aparece como esposa
    const f = familyState(st)!;
    Object.assign(f.added[0], { name: "Maria Eduarda Lima", female: false, chosen: undefined });
    expect(roleLabel(spouse())).toBe("Esposa");

    // e se o jogo ainda errar, o jogador acerta (e a escolha dele fica, mesmo com nome feminino)
    const fix = performAction(new Ctx(state, `action:${p.id}:3`), p.id, "acertar_familia", { pessoa: f.added[0].id, quem: "homem" });
    expect(fix.ok, fix.message).toBe(true);
    expect(roleLabel(spouse())).toBe("Marido");

    expect(performAction(new Ctx(state, `action:${p.id}:4`), p.id, "ter_filho", { nome: "Ariel", sexo: "menina" }).ok).toBe(true);
    expect(roleLabel(familyOf(ctx, p, st).find((m) => m.role === "FILHO")!)).toBe("Filha");
  });
});
