import { describe, expect, it } from "vitest";
import { createCharacter } from "../src/character";
import { Ctx } from "../src/state";
import { looksFemale } from "../src/gender";
import { moderateText } from "../src/news/moderation";
import { containsRealName, namesIn, quickNames, realNameSet } from "../src/quickname";
import { Rng } from "../src/rng";
import { cities, freshWorld, snapshot } from "./helpers";

const REAL = new Set(["REAL_ACTIVE_AT_SNAPSHOT", "REAL_HISTORICAL"]);

describe("Criar rápido: nomes prontos", () => {
  it("nome que contém um nome real é reconhecido como a moderação faz", () => {
    const real = realNameSet(["Carlos Viana", "Ana Paula Rocha"]);
    expect(containsRealName("Carlos Viana Toledo", real)).toBe(true);
    expect(containsRealName("Marcelo Ana Paula Rocha", real)).toBe(true);
    expect(containsRealName("Carlos Toledo Viana", real)).toBe(false);
    expect(containsRealName("Ana Rocha", real)).toBe(false);
  });

  for (const year of [2002, 2006, 2010, 2014, 2018, 2022, 2026]) {
    it(`${year}: os nomes dos dados cobrem todas as pessoas reais do mundo`, () => {
      const { state } = freshWorld("rapido", year);
      const fromData = realNameSet([...namesIn(snapshot(year)), ...namesIn(cities(year))]);
      const inWorld = [...state.t.persons.values()].filter((p) => REAL.has(p.kind)).map((p) => p.name);
      expect(inWorld.length).toBeGreaterThan(100);
      const missing = [...realNameSet(inWorld)].filter((n) => !fromData.has(n));
      expect(missing).toEqual([]);
    });

    it(`${year}: toda sugestão passa na criação de personagem`, () => {
      const { state } = freshWorld("rapido", year);
      const realNames = [...state.t.persons.values()].filter((p) => REAL.has(p.kind)).map((p) => p.name);
      const extra = realNames.filter((n) => n.split(" ").length >= 2);
      const real = realNameSet([...namesIn(snapshot(year)), ...namesIn(cities(year))]);
      for (let k = 0; k < 6; k++) {
        const { F, M } = quickNames(new Rng(`sugestao-${year}-${k}`), real, 8);
        expect(F).toHaveLength(8);
        expect(M).toHaveLength(8);
        expect(new Set([...F, ...M]).size).toBe(16);
        for (const n of F) expect(looksFemale(n)).toBe(true);
        for (const n of M) expect(looksFemale(n)).toBe(false);
        for (const n of [...F, ...M]) expect(moderateText(n, { minLength: 3, maxLength: 40, extraRealNames: extra }).ok, n).toBe(true);
      }
    });
  }

  it("cria o personagem com o nome sugerido e os padrões do Criar rápido", () => {
    const { state } = freshWorld("rapido-cria", 2026);
    const real = realNameSet([...namesIn(snapshot(2026)), ...namesIn(cities(2026))]);
    const { F } = quickNames(new Rng("cria"), real, 3);
    const ctx = new Ctx(state, "setup");
    const r = createCharacter(ctx, { userId: "00000000-0000-4000-8000-000000000001", name: F[0], uf: "MG", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {}, gender: "F" });
    expect(r.ok, r.ok ? "" : r.error).toBe(true);
    const me = [...state.t.persons.values()].find((p) => p.kind === "PLAYER");
    expect(me?.name).toBe(F[0]);
    expect(me?.municipality).toBe("3106200");
  });
});
