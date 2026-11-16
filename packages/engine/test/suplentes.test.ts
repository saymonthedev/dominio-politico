import { describe, expect, it } from "vitest";
import {
  createCharacter,
  createRaces,
  Ctx,
  emptyCampaign,
  fillVacancies,
  isSubstitute,
  joinParty,
  OFFICES,
  processMandates,
  retire,
  runFirstRound,
  runTicks,
  type CandidacyRow,
  type MandateRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

/** Mundo novo já com a legislatura eleita em 2026 empossada (1º/02/2027). */
function sitting(seed: string): WorldState {
  const { state } = freshWorld(seed);
  state.world.game_date = "2027-02-01";
  processMandates(new Ctx(state, "tick"));
  return state;
}

const seated = (state: WorldState, office: string, geo: string): MandateRow[] =>
  [...state.t.mandates.values()].filter((m) => m.office_code === office && m.geo === geo && m.status === "ATIVO" && state.t.persons.get(m.person_id)?.status === "ACTIVE");

/** Pula para a data: posses e fins de mandato (duas vezes: num pulo de anos, a legislatura do meio começa e acaba). */
function goTo(state: WorldState, date: string): void {
  state.world.game_date = date;
  processMandates(new Ctx(state, "tick"));
  processMandates(new Ctx(state, "tick"));
}

/** Enche as vagas que o mundo já tenha (para medir só as que o teste abre). */
function settle(state: WorldState): void {
  for (let i = 0; i < 40 && fillVacancies(new Ctx(state, "tick")) > 0; i++);
}

describe("suplentes assumem as cadeiras vagas do Legislativo", () => {
  it("cassado: a cadeira fica com o partido de quem saiu, e o Ceará volta a ter 22 deputados federais (na semana do mundo)", () => {
    const state = sitting("sup-cassacao");
    // domingo: o mundo anda para segunda-feira, dia da etapa dos suplentes
    state.world.game_date = "2027-03-07";
    settle(state);
    expect(seated(state, "DEP_FEDERAL", "CE")).toHaveLength(22);
    const m = seated(state, "DEP_FEDERAL", "CE")[0];
    const gone = state.t.persons.get(m.person_id)!;
    const party = gone.party_id;
    // cassação como na condenação: mandato encerrado no dia e a pessoa fora da vida pública
    m.status = "ENCERRADO";
    m.end_on = state.world.game_date;
    gone.status = "RETIRED";
    expect(seated(state, "DEP_FEDERAL", "CE")).toHaveLength(21);
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    const now = seated(state, "DEP_FEDERAL", "CE");
    expect(now).toHaveLength(22);
    const sub = now.find(isSubstitute)!;
    expect(sub).toBeTruthy();
    expect(sub.start_on).toBe(state.world.game_date);
    expect(sub.end_on).toBe("2031-02-01");
    const p = state.t.persons.get(sub.person_id)!;
    expect(p.party_id).toBe(party);
    expect(p.kind).toBe("FICTIONAL_GENERATED");
    expect(p.office_code).toBe("DEP_FEDERAL");
    expect(p.stage).toBe("MANDATO");
  });

  it("aposentado com o mandato aberto e quem nem está mais na memória do servidor também abrem vaga", () => {
    const state = sitting("sup-aposentado");
    state.world.game_date = "2027-05-10";
    settle(state);
    const ctx = new Ctx(state, "tick");
    const [a, b] = seated(state, "DEP_ESTADUAL", "BA");
    const pa = state.t.persons.get(a.person_id)!;
    const pb = state.t.persons.get(b.person_id)!;
    // aposentadoria (npclife) só encerrava os mandatos futuros: o atual ficava aberto
    retire(ctx, pa);
    expect(a.status).toBe("ATIVO");
    // fora da memória (o servidor não guarda quem saiu da vida pública): o partido vem da eleição
    state.t.persons.delete(pb.id);
    const before = seated(state, "DEP_ESTADUAL", "BA").length;
    expect(fillVacancies(ctx)).toBe(2);
    expect(a.status).toBe("ENCERRADO");
    expect(a.end_on).toBe(state.world.game_date);
    expect(b.status).toBe("ENCERRADO");
    const now = seated(state, "DEP_ESTADUAL", "BA");
    expect(now).toHaveLength(before + 2);
    const subs = now.filter(isSubstitute).map((m) => state.t.persons.get(m.person_id)!.party_id).sort();
    expect(subs).toEqual([pa.party_id, pb.party_id].sort());
  });

  it("cadeira que a apuração deixava vazia: a eleição enche todas, e a casa que ficou com menos é completada", () => {
    const { state } = freshWorld("sup-apuracao");
    const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
    createRaces(new Ctx(state, "action:setup"), e);
    e.status = "CAMPANHA";
    state.world.game_date = e.first_round;
    runFirstRound(new Ctx(state, "tick"), e);
    const races = [...state.t.races.values()].filter((r) => r.election_id === e.id && OFFICES[r.office_code].system === "PROPORCIONAL");
    for (const r of races) {
      const made = [...state.t.mandates.values()].filter((m) => m.election_id === e.id && m.office_code === r.office_code && m.geo === r.geo).length;
      expect(made, r.id).toBe(r.seats);
    }
    // a posse da legislatura nova, e um mundo antigo em que uma cadeira nunca foi preenchida
    goTo(state, "2031-02-01");
    settle(state);
    const lost = seated(state, "DEP_FEDERAL", "CE").find((m) => m.election_id === e.id)!;
    state.t.mandates.delete(lost.id);
    expect(seated(state, "DEP_FEDERAL", "CE")).toHaveLength(21);
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(1);
    expect(seated(state, "DEP_FEDERAL", "CE")).toHaveLength(22);
  });

  it("o jogador suplente mais votado do partido assume a vaga, com aviso, até o fim da legislatura", () => {
    const { state } = freshWorld("sup-jogador");
    const ctx = new Ctx(state, "action:setup");
    const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
    createRaces(ctx, e);
    const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.CE ?? 0) - (a.territory.CE ?? 0))[0];
    const me = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000071", name: "Rian Teste", uf: "CE", age: 40, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
    joinParty(ctx, me, party);
    const st = state.t.person_states.get(me.id)!;
    st.reach = {};
    me.reputation = 0;
    const race = state.t.races.get(`${e.id}:DEP_FEDERAL:CE`)!;
    const c: CandidacyRow = { id: "cand_sup_rian", world_id: state.world.id, election_id: e.id, race_id: race.id, person_id: me.id, party_id: party.id, office_code: "DEP_FEDERAL", geo: "CE", status: "HOMOLOGADA", is_player: true, ballot_number: party.number * 100 + 7, campaign: emptyCampaign(), votes: 0, vote_share: 0, note: null };
    state.t.candidacies.set(c.id, c);
    e.status = "CAMPANHA";
    state.world.game_date = e.first_round;
    runFirstRound(new Ctx(state, "tick"), e);
    expect(c.status).toBe("SUPLENTE");
    expect((e.summary.suplentes as Record<string, Array<{ id: string }>>)["DEP_FEDERAL:CE"].map((s) => s.id)).toContain(me.id);
    expect(((e.summary.pendingSeats as Record<string, Record<string, number>>)["DEP_FEDERAL:CE"][party.id] ?? 0) > 0).toBe(true);

    // na legislatura, alguém do partido é cassado: quem assume é o jogador
    goTo(state, "2031-02-01");
    settle(state);
    expect(me.office_code).toBeNull();
    state.world.game_date = "2032-06-10";
    const out = seated(state, "DEP_FEDERAL", "CE").find((m) => m.election_id === e.id && state.t.persons.get(m.person_id)!.party_id === party.id)!;
    out.status = "ENCERRADO";
    out.end_on = state.world.game_date;
    state.t.persons.get(out.person_id)!.status = "RETIRED";
    const tick = new Ctx(state, "tick");
    expect(fillVacancies(tick)).toBe(1);
    const mine = [...state.t.mandates.values()].find((m) => m.person_id === me.id && m.status === "ATIVO")!;
    expect(isSubstitute(mine)).toBe(true);
    expect(mine).toMatchObject({ office_code: "DEP_FEDERAL", geo: "CE", start_on: "2032-06-10", end_on: "2035-02-01" });
    expect(me.office_code).toBe("DEP_FEDERAL");
    expect(me.stage).toBe("MANDATO");
  });

  it("Senado: assume o 1º suplente da chapa; se ele também sair, o 2º", () => {
    const state = sitting("sup-senado");
    state.world.game_date = "2027-04-01";
    settle(state);
    const e = state.t.elections.get("e2026")!;
    const [sen] = seated(state, "SENADOR", "CE").filter((m) => m.election_id === e.id);
    const senator = state.t.persons.get(sen.person_id)!;
    const [s1, s2] = [...state.t.persons.values()].filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && !x.office_code && x.party_id && x.party_id !== senator.party_id).slice(0, 2);
    e.summary.suplentes = { "SENADOR:CE": [s1, s2].map((x) => ({ id: x.id, party: x.party_id, of: senator.id })) };
    sen.status = "ENCERRADO";
    sen.end_on = state.world.game_date;
    senator.status = "RETIRED";
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(1);
    expect(s1.office_code).toBe("SENADOR");
    expect(seated(state, "SENADOR", "CE").length).toBe(3);
    // o 1º suplente sai: assume o 2º (do partido da chapa, não um nome novo)
    s1.status = "RETIRED";
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(1);
    expect(s2.office_code).toBe("SENADOR");
    expect(seated(state, "SENADOR", "CE").map((m) => m.person_id)).toContain(s2.id);
  });

  it("as casas que ficaram vazias antes enchem aos poucos: até 300 cadeiras por vez", () => {
    const state = sitting("sup-ritmo");
    state.world.game_date = "2028-03-01";
    settle(state);
    let open = 0;
    for (const uf of ["BA", "MG", "RJ", "SP"]) {
      for (const m of seated(state, "DEP_ESTADUAL", uf)) {
        m.status = "ENCERRADO";
        m.end_on = state.world.game_date;
        state.t.persons.get(m.person_id)!.status = "RETIRED";
        open++;
      }
    }
    expect(open).toBeGreaterThan(300);
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(300);
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(open - 300);
    expect(fillVacancies(new Ctx(state, "tick"))).toBe(0);
  });
});
