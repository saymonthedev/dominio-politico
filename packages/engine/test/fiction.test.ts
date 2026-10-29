import { describe, expect, it } from "vitest";
import { cityNow, fictionalizeCities, fictionalizeWorld, isFictional, KNOWN_ACRONYMS, runTicks, UFS } from "../src";
import { cities, freshWorld, snapshot } from "./helpers";

describe("mundo fictício", () => {
  it("troca todas as pessoas e partidos reais por nomes inventados, inclusive nos textos e nos municípios", () => {
    const { state, changes } = freshWorld("ficcao");
    const realNames = new Set([...state.t.persons.values()].filter((p) => p.kind.startsWith("REAL")).map((p) => p.name));
    const realAcr = [...state.t.parties.values()].map((p) => p.acronym);
    const t0 = Date.now();
    fictionalizeWorld(state, changes);
    expect(Date.now() - t0).toBeLessThan(15_000);
    expect(isFictional(state)).toBe(true);
    for (const p of state.t.persons.values()) {
      expect(p.kind === "REAL_ACTIVE_AT_SNAPSHOT" || p.kind === "REAL_HISTORICAL").toBe(false);
      expect(p.external_ref).toBeNull();
    }
    const parties = [...state.t.parties.values()];
    expect(parties.every((p) => p.is_fictional && !KNOWN_ACRONYMS.has(p.acronym) && !UFS.some((u) => u.code === p.acronym))).toBe(true);
    expect(new Set(parties.map((p) => p.acronym)).size).toBe(parties.length);
    // nenhuma figura conhecida sobra nas notícias iniciais
    const sp = snapshot().races.find((r) => r.office === "PRESIDENTE" && r.round === 2)!;
    const winner = sp.candidates.find((c) => c.elected)!.name;
    const text = changes.get("news_articles").map((n) => `${n.headline} ${n.body}`).join("\n");
    expect(text).not.toContain(winner);
    for (const acr of realAcr.filter((a) => a.length > 2)) expect(text).not.toMatch(new RegExp(`\\b${acr}\\b`));
    expect([...state.t.persons.values()].filter((p) => realNames.has(p.name)).length).toBeLessThan(5);
    // municípios: prefeitos e câmaras usam os nomes e siglas do mundo
    const fc = fictionalizeCities(new Map(cities().map((c) => [c.id, c])), state);
    const acrs = new Set(parties.map((p) => p.acronym));
    const sample = [...fc.values()].slice(0, 300);
    for (const c of sample) {
      if (c.mayor) expect(realNames.has(c.mayor.name)).toBe(false);
      for (const k of Object.keys(c.council)) expect(acrs.has(k) || /^P\d\d$/.test(k)).toBe(true);
    }
    state.cities = fc;
    const capital = [...fc.values()].find((c) => c.capital)!;
    expect(cityNow(state, capital.id)?.mayor?.partyId).toBeTruthy();
    // o mundo segue rodando normalmente
    expect(runTicks(state, { target: state.world.tick + 3, maxTicks: 3 }).ticks).toBe(3);
  });
});
