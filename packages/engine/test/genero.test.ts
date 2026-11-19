import { describe, expect, it } from "vitest";
import { createCharacter, Ctx, genderize, genderOf, officeTitle, spawnProceduralCadre, stageTitle } from "../src";
import { freshWorld } from "./helpers";

describe("gênero do personagem (sugestão da jogadora Emyle Victorya)", () => {
  it("passa o neutro para o feminino ou o masculino e deixa quem é outra pessoa como está", () => {
    expect(genderize("Você foi eleito(a)! Bem-vindo(a), cidadão(ã).", "F")).toBe("Você foi eleita! Bem-vinda, cidadã.");
    expect(genderize("Você foi eleito(a)! Bem-vindo(a), cidadão(ã).", "M")).toBe("Você foi eleito! Bem-vindo, cidadão.");
    expect(genderize("VOCÊ FOI ELEITO(A)!", "F")).toBe("VOCÊ FOI ELEITA!");
    expect(genderize("Você é o(a) presidente da legenda e um(a) pré-candidato(a) cansado(a).", "F")).toBe("Você é a presidente da legenda e uma pré-candidata cansada.");
    expect(genderize("Seu filho(a) e o jogador(a) aliado(a) chegaram.", "F")).toBe("Seu filho(a) e o jogador(a) aliado(a) chegaram.");
    expect(genderize("Você foi eleito(a).", null)).toBe("Você foi eleito(a).");
    expect(genderize("processo(s) e opção (a) ou (b)", "F")).toBe("processo(s) e opção (a) ou (b)");
  });

  it("cargo e etapa da carreira no gênero da pessoa", () => {
    expect(officeTitle("VEREADOR", "F")).toBe("Vereadora");
    expect(officeTitle("DEP_FEDERAL", "F")).toBe("Deputada federal");
    expect(officeTitle("GOVERNADOR", "M")).toBe("Governador");
    expect(officeTitle("PRESIDENTE", "F")).toBe("Presidente da República");
    expect(officeTitle("SENADOR", null)).toBe("Senador(a)");
    expect(stageTitle("CIDADAO", "F")).toBe("Cidadã");
    expect(stageTitle("PRE_CANDIDATO", "M")).toBe("Pré-candidato");
    expect(stageTitle("MANDATO", "F")).toBe("Em mandato");
  });

  it("a jogadora escolhe ser mulher; fictícios seguem o nome; pessoa real fica sem gênero", () => {
    const { state } = freshWorld("genero");
    const ctx = new Ctx(state, "action:genero");
    const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-0000000000e1", name: "Emyle Teste", uf: "SP", age: 25, profession: "professor", origin: "classe_media", interests: [], ideology: {}, gender: "F" });
    expect(r.ok).toBe(true);
    expect(r.person!.gender).toBe("F");
    expect(genderOf(r.person)).toBe("F");
    const r2 = createCharacter(ctx, { userId: "00000000-0000-0000-0000-0000000000e2", name: "Sem Escolha", uf: "SP", age: 25, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
    expect(r2.person!.gender).toBeNull();
    expect(genderOf(r2.person)).toBeNull();
    const party = [...state.t.parties.values()].find((p) => p.status === "ATIVO")!;
    const npc = spawnProceduralCadre(ctx, { partyId: party.id, uf: "SP", ideology: party.ideology, roleLabel: "teste" });
    expect(npc.gender).toBe(/a$/.test(npc.name.split(" ")[0]) ? "F" : npc.gender);
    expect(genderOf(npc)).toBe(npc.gender);
    const real = [...state.t.persons.values()].find((p) => p.kind === "REAL_ACTIVE_AT_SNAPSHOT")!;
    expect(genderOf(real)).toBeNull();
  });
});
