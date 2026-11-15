import { describe, expect, it } from "vitest";
import {
  addDays,
  ballotOf,
  createCharacter,
  createRaces,
  Ctx,
  emptyCampaign,
  joinParty,
  openUrna,
  runFirstRound,
  urnasBetween,
  type CandidacyRow,
  type OfficeCode,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

/** Eleitor(a) em SC com candidatura a deputado(a) federal nas gerais de 2030, já em campanha. */
function gerais(seed: string) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, {
    userId: "00000000-0000-0000-0000-000000000096",
    name: "Rui Teste",
    uf: "SC",
    age: 45,
    profession: "professor",
    origin: "classe_media",
    interests: [],
    ideology: { economy: -10 },
  });
  expect(r.ok, r.error).toBe(true);
  const p = r.person!;
  const parties = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => a.number - b.number);
  const pt = parties.find((x) => x.acronym === "PT")!;
  joinParty(ctx, p, pt);
  const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
  createRaces(ctx, e);
  e.status = "CAMPANHA";
  state.t.races.get(`${e.id}:SENADOR:SC`)!.seats = 2;
  const people = [...state.t.persons.values()].filter((x) => x.status === "ACTIVE" && x.kind !== "PLAYER" && x.id !== p.id);
  let n = 0;
  const add = (office: OfficeCode, geo: string, personId: string, partyIdx: number, extra: Partial<CandidacyRow> = {}) => {
    const party = parties[partyIdx];
    const c: CandidacyRow = {
      id: `cand_urna_${n++}`,
      world_id: state.world.id,
      election_id: e.id,
      race_id: `${e.id}:${office}:${geo}`,
      person_id: personId,
      party_id: party.id,
      office_code: office,
      geo,
      status: "HOMOLOGADA",
      is_player: false,
      ballot_number: office === "SENADOR" ? party.number * 10 + 1 : party.number,
      campaign: emptyCampaign(),
      votes: 0,
      vote_share: 0,
      note: null,
      ...extra,
    };
    state.t.candidacies.set(c.id, c);
    return c;
  };
  const vice = people[9];
  add("GOVERNADOR", "SC", people[0].id, 0, { campaign: { ...emptyCampaign(), vice: { id: vice.id, name: vice.name, party_id: null } } });
  add("GOVERNADOR", "SC", people[1].id, 1);
  add("PRESIDENTE", "BR", people[2].id, 0);
  add("PRESIDENTE", "BR", people[3].id, 1);
  add("SENADOR", "SC", people[4].id, 0);
  add("SENADOR", "SC", people[5].id, 1);
  const mine = add("DEP_FEDERAL", "SC", p.id, parties.indexOf(pt), { is_player: true, ballot_number: 1377 });
  return { state, p, e, pt, mine };
}

const offices = (state: WorldState, id: string, date: string) => openUrna(state, id, date)?.offices.map((o) => o.title) ?? null;

describe("urna simbólica", () => {
  it("abre na semana da votação com os cargos na ordem da urna, a colinha e o jogador na cédula", () => {
    const { state, p, e, pt } = gerais("urna-gerais");
    // longe da votação, ou depois dela, a urna não aparece
    expect(openUrna(state, p.id, addDays(e.first_round, -30))).toBeNull();
    expect(openUrna(state, p.id, addDays(e.first_round, 1))).toBeNull();

    const u = openUrna(state, p.id, addDays(e.first_round, -3))!;
    expect(u.round).toBe(1);
    expect(u.place).toBe("Santa Catarina");
    expect(u.key).toBe(`${state.world.id}:${e.id}:1`);
    expect(u.offices.map((o) => o.title)).toEqual(["Deputado(a) federal", "Deputado(a) estadual", "Senador(a) · 1ª vaga", "Senador(a) · 2ª vaga", "Governador(a)", "Presidente"]);
    const [fed, est, sen1, , gov, pres] = u.offices;
    // deputado: 4 dígitos, o próprio jogador na colinha e as legendas
    expect(fed.digits).toBe(4);
    expect(fed.proportional).toBe(true);
    expect(fed.candidates[0]).toMatchObject({ me: true, number: 1377, party: "PT" });
    expect(fed.parties.some((x) => x.number === pt.number && x.acronym === "PT")).toBe(true);
    // sem candidatura com nome: só legenda, branco ou nulo
    expect(est.candidates).toHaveLength(0);
    expect(est.parties.length).toBeGreaterThan(5);
    expect(sen1.digits).toBe(3);
    expect(sen1.candidates.every((c) => String(c.number).length === 3)).toBe(true);
    expect(gov.candidates.map((c) => c.number).every((x) => x < 100)).toBe(true);
    expect(gov.candidates.find((c) => c.mates)?.mates?.[0].label).toBe("Vice-governador(a)");
    expect(pres.candidates).toHaveLength(2);
    expect(pres.parties).toHaveLength(0);
  });

  it("depois da contagem, a cédula do dia sai do resultado; no 2º turno, só as disputas que seguiram", () => {
    const { state, p, e, mine } = gerais("urna-contagem");
    const before = openUrna(state, p.id, addDays(e.first_round, -1))!;
    state.world.game_date = e.first_round;
    runFirstRound(new Ctx(state, "tick"), e);
    expect(mine.status).not.toBe("HOMOLOGADA");
    expect(offices(state, p.id, e.first_round)).toBeNull();

    const [night] = urnasBetween(state, p.id, addDays(e.first_round, -1), e.first_round);
    expect(night.key).toBe(before.key);
    expect(night.offices.map((o) => o.key)).toEqual(before.offices.map((o) => o.key));
    // os mesmos nomes de antes da contagem, e o jogador continua na cédula dele
    for (const [i, o] of night.offices.entries()) expect(o.candidates.map((c) => c.id).sort()).toEqual(before.offices[i].candidates.map((c) => c.id).sort());
    expect(night.offices[0].candidates.some((c) => c.me)).toBe(true);

    // 2º turno para presidente: só esse cargo, com os dois que seguiram
    const race = state.t.races.get(`${e.id}:PRESIDENTE:BR`)!;
    race.status = "SEGUNDO_TURNO";
    delete race.results.runoff;
    for (const c of state.t.candidacies.values()) if (c.race_id === race.id) c.status = "SEGUNDO_TURNO";
    for (const r of state.t.races.values()) if (r.election_id === e.id && r.id !== race.id && r.status === "SEGUNDO_TURNO") r.status = "ENCERRADA";
    const second = ballotOf(state, p.id, e, 2)!;
    expect(second.round).toBe(2);
    expect(second.date).toBe(e.runoff);
    expect(second.offices.map((o) => o.office)).toEqual(["PRESIDENTE"]);
    expect(second.offices[0].candidates).toHaveLength(2);
  });
});
