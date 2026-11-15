import { describe, expect, it } from "vitest";
import { createRaces, Ctx, dedupeNames, OFFICES, runFirstRound, runTicks, spawnProceduralCadre } from "../src";
import { freshWorld } from "./helpers";

describe("nomes sem repetição", () => {
  it("eleitos sem nome do mesmo partido, na mesma disputa e no mesmo dia, saem com nomes (e idades) diferentes", () => {
    const { state } = freshWorld("nomes-spawn");
    const ctx = new Ctx(state, "tick");
    const party = [...state.t.parties.values()].find((p) => p.status === "ATIVO")!;
    const before = new Set([...state.t.persons.values()].map((p) => p.name));
    const made = Array.from({ length: 25 }, () => spawnProceduralCadre(ctx, { partyId: party.id, uf: "SP", ideology: party.ideology, roleLabel: `deputado(a) federal do ${party.acronym}` }));
    expect(new Set(made.map((p) => p.name)).size).toBe(25);
    expect(made.some((p) => before.has(p.name))).toBe(false);
    expect(new Set(made.map((p) => p.birth_year)).size).toBeGreaterThan(3);
  });

  it("a contagem das proporcionais não repete nome na lista de eleitos", () => {
    const { state } = freshWorld("nomes-contagem");
    const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
    createRaces(new Ctx(state, "action:setup"), e);
    e.status = "CAMPANHA";
    state.world.game_date = e.first_round;
    runFirstRound(new Ctx(state, "tick"), e);
    const races = [...state.t.races.values()].filter((r) => r.election_id === e.id && OFFICES[r.office_code].system === "PROPORCIONAL");
    expect(races.length).toBeGreaterThan(20);
    for (const r of races) {
      const names = (r.results.first?.candidates ?? []).map((c) => c.name);
      expect(new Set(names).size, r.id).toBe(names.length);
    }
  });

  it("mundos antigos: o primeiro fica, os repetidos ganham um sobrenome do meio (também nos resultados e na chapa), e só uma vez", () => {
    const { state } = freshWorld("nomes-reparo");
    const fic = [...state.t.persons.values()].filter((p) => p.kind === "FICTIONAL_GENERATED" && p.status === "ACTIVE").slice(0, 3);
    const real = [...state.t.persons.values()].find((p) => p.kind === "REAL_ACTIVE_AT_SNAPSHOT" && p.status === "ACTIVE")!;
    expect(fic).toHaveLength(3);
    for (const p of fic) p.name = "Ana Pereira";
    // um fictício com o nome de uma pessoa real muda; a pessoa real, não
    const other = [...state.t.persons.values()].filter((p) => p.kind === "FICTIONAL_GENERATED" && p.status === "ACTIVE")[3];
    other.name = real.name;
    const race = [...state.t.races.values()].find((r) => r.results.first?.candidates?.length)!;
    race.results.first!.candidates.push({ candidacy_id: `${race.id}:${fic[2].id}`, person_id: fic[2].id, name: "Ana Pereira", party_id: race.results.first!.candidates[0].party_id, votes: 1, share: 0 });
    const cand = [...state.t.candidacies.values()][0];
    cand.campaign.vice = { id: fic[1].id, name: "Ana Pereira", party_id: null };

    // roda no próximo dia do mundo, uma vez
    delete state.world.stats.names_v1;
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(state.world.stats.names_v1).toBe(1);
    expect(fic[0].name).toBe("Ana Pereira");
    expect(fic[1].name).not.toBe("Ana Pereira");
    expect(fic[2].name).not.toBe(fic[1].name);
    for (const p of fic.slice(1)) expect(p.name).toMatch(/^Ana \S+ Pereira$/);
    expect(real.name).not.toBe(other.name);
    expect(race.results.first!.candidates.at(-1)!.name).toBe(fic[2].name);
    expect(cand.campaign.vice!.name).toBe(fic[1].name);
    // nenhum fictício repete nome (homônimos reais, que existem nos dados oficiais, ficam como são)
    const people = [...state.t.persons.values()];
    const fictional = people.filter((p) => p.kind === "FICTIONAL_GENERATED").map((p) => p.name);
    const others = new Set(people.filter((p) => p.kind !== "FICTIONAL_GENERATED").map((p) => p.name));
    expect(new Set(fictional).size).toBe(fictional.length);
    expect(fictional.some((n) => others.has(n))).toBe(false);
    // depois disso não roda de novo
    fic[2].name = "Ana Pereira";
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(fic[2].name).toBe("Ana Pereira");
    expect(dedupeNames(new Ctx(state, "tick"))).toBe(1);
  });
});
