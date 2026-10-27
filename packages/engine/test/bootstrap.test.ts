import { describe, expect, it } from "vitest";
import { ufShares } from "../src/support";
import { freshWorld } from "./helpers";

describe("bootstrap do mundo real", () => {
  const { state, changes } = freshWorld();

  it("importa partidos reais e bancadas oficiais", () => {
    const parties = [...state.t.parties.values()];
    expect(parties.length).toBe(30);
    const camara = parties.reduce((s, p) => s + (p.seats.camara ?? 0), 0);
    expect(camara).toBe(513);
    const senado = parties.reduce((s, p) => s + (p.seats.senado ?? 0), 0);
    expect(senado).toBe(81);
    expect(parties.every((p) => p.integrity === 0.5)).toBe(true);
    expect(state.t.parties.get("pty_13")?.gov_alignment).toBe(1);
    expect(state.t.parties.get("pty_22")?.gov_alignment).toBe(-1);
  });

  it("cria o presidente reeleito com dois mandatos consecutivos", () => {
    const pres = state.t.persons.get(state.world.gov.president_id!);
    expect(pres?.name).toBe("Lula");
    expect(pres?.kind).toBe("REAL_ACTIVE_AT_SNAPSHOT");
    const mandates = [...state.t.mandates.values()].filter((m) => m.person_id === pres!.id);
    expect(mandates.map((m) => m.status).sort()).toEqual(["ATIVO", "FUTURO"]);
  });

  it("pessoas reais nunca têm propensão a risco (não entram em esquemas)", () => {
    for (const p of state.t.persons.values()) {
      if (p.kind === "REAL_ACTIVE_AT_SNAPSHOT") expect(state.t.person_states.get(p.id)!.traits.riskTolerance).toBe(0);
    }
  });

  it("tem mandatos futuros para todos os eleitos de 2026", () => {
    const fut = [...state.t.mandates.values()].filter((m) => m.status === "FUTURO");
    const by = (o: string) => fut.filter((m) => m.office_code === o).length;
    expect(by("DEP_FEDERAL")).toBe(513);
    expect(by("GOVERNADOR")).toBe(27);
    expect(by("SENADOR")).toBe(54);
    expect(by("PRESIDENTE")).toBe(1);
  });

  it("calibra o eleitorado para reproduzir o 2º turno presidencial por UF", () => {
    const pt = state.t.parties.get("pty_13")!;
    const pl = state.t.parties.get("pty_22")!;
    const base = { reputation: 50, recognition: 1, partyStrength: 0, incumbent: false, momentum: 0, scandal: 0, noise: 0 };
    for (const uf of ["SP", "BA", "SC"]) {
      const segs = [...state.t.voter_segments.values()].filter((s) => s.uf === uf);
      const r = ufShares(segs, [{ id: "PT", ideology: pt.ideology, govAlignment: 1, ...base }, { id: "PL", ideology: pl.ideology, govAlignment: -1, ...base }], 50, 0);
      const pls = r.shares.get("PL")! * 100;
      if (uf === "BA") expect(pls).toBeLessThan(40);
      if (uf === "SC") expect(pls).toBeGreaterThan(60);
    }
  });

  it("publica o fato real do snapshot com fonte", () => {
    const news = changes.get("news_articles");
    const fact = news.find((n) => n.factual);
    expect(fact?.headline).toContain("Lula");
    expect(fact?.source_id).toBe("tse-noticia-reeleicao-2026");
  });

  it("é determinístico para a mesma seed", () => {
    const a = freshWorld("x").changes.toJSON();
    const b = freshWorld("x").changes.toJSON();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
