import { describe, expect, it } from "vitest";
import { createCharacter, createRaces, Ctx, emptyCampaign, joinParty, projectList, type CandidacyRow, type PersonRow } from "../src";
import { freshWorld } from "./helpers";

describe("nominata: a chapa proporcional na projeção", () => {
  it("lista você, os outros jogadores e quem tenta a reeleição, com a soma da legenda e o quociente", () => {
    const { state } = freshWorld("nominata");
    const ctx = new Ctx(state, "action:setup");
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && x.acronym === "PT")!;
    const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
    createRaces(ctx, e);
    const race = state.t.races.get(`${e.id}:DEP_FEDERAL:SP`)!;
    const player = (n: number): [PersonRow, CandidacyRow] => {
      const p = createCharacter(ctx, { userId: `00000000-0000-0000-0000-00000000009${n}`, name: `Teste ${n}`, uf: "SP", age: 40, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
      joinParty(ctx, p, party);
      const c: CandidacyRow = { id: `cand_nomi_${n}`, world_id: state.world.id, election_id: e.id, race_id: race.id, person_id: p.id, party_id: party.id, office_code: "DEP_FEDERAL", geo: "SP", status: "HOMOLOGADA", is_player: true, ballot_number: 1300 + n, campaign: emptyCampaign(), votes: 0, vote_share: 0, note: null };
      state.t.candidacies.set(c.id, c);
      return [p, c];
    };
    const [me, mine] = player(1);
    const [mate] = player(2);
    // alguém do partido com mandato de deputado(a) federal por SP, que tenta a reeleição
    const inc = [...state.t.persons.values()].find((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE")!;
    Object.assign(inc, { party_id: party.id, office_code: "DEP_FEDERAL", office_geo: "SP" });
    const proj = projectList(new Ctx(state, "read"), mine)!;
    expect(proj.list.find((m) => m.kind === "VOCE")?.id).toBe(me.id);
    expect(proj.list.find((m) => m.kind === "JOGADOR")?.id).toBe(mate.id);
    expect(proj.list.find((m) => m.kind === "MANDATO")?.id).toBe(inc.id);
    expect(proj.partyVotes).toBeGreaterThan(0);
    expect(proj.quotient).toBeGreaterThan(0);
    // os nomes somam 92% da legenda (o resto é o voto só no partido)
    const names = proj.list.reduce((s, m) => s + m.votes, 0) + proj.rest.votes;
    expect(Math.abs(names - proj.partyVotes * 0.92)).toBeLessThan(proj.partyVotes * 0.01 + proj.list.length + 1);
    expect(proj.list.find((m) => m.kind === "VOCE")!.rank).toBe(proj.position);
    for (const m of proj.list) expect(m.in).toBe(m.rank <= proj.partySeats);
    expect(proj.toNextQuotient).toBeGreaterThanOrEqual(0);
    expect(proj.toNextQuotient).toBeLessThanOrEqual(proj.quotient);
    expect(["PUXADOR", "VAGA", "LONGE"]).toContain(proj.role);
  });
});
