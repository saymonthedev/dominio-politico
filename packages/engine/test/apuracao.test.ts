import { describe, expect, it } from "vitest";
import { canonicalGeo, createCharacter, Ctx, electionNight, emptyCampaign, ensureRace, joinParty, runTicks, type CandidacyRow } from "../src";
import { freshWorld } from "./helpers";

describe("apuração no dia da votação", () => {
  it("mostra a disputa do jogador (vereador, com os votos dele) e a prefeitura no mesmo dia", () => {
    const { state } = freshWorld("apuracao-1");
    const r = createCharacter(new Ctx(state, "action:setup"), {
      userId: "00000000-0000-0000-0000-000000000077",
      name: "Lia Teste",
      uf: "SC",
      age: 35,
      profession: "professor",
      origin: "classe_media",
      interests: [],
      ideology: { economy: 10, social: 5 },
    });
    expect(r.ok, r.error).toBe(true);
    const p = r.person!;
    // o mundo de teste começa depois da eleição de 2026: a próxima é a municipal de 2028
    const e = [...state.t.elections.values()].find((x) => x.year === 2028)!;
    // filiado e com candidatura homologada a vereador na cidade dele
    const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.SC ?? 0) - (a.territory.SC ?? 0))[0];
    joinParty(new Ctx(state, "action:join"), p, party);
    // até a véspera da votação
    const eve = Date.parse(`${e.first_round}T12:00:00Z`) - 86_400_000;
    const days = Math.round((eve - Date.parse(`${state.world.game_date}T12:00:00Z`)) / 86_400_000);
    runTicks(state, { target: state.world.tick + days, maxTicks: days });
    const city = canonicalGeo(p.municipality);
    const race = ensureRace(new Ctx(state, "action:race"), e, "VEREADOR", city);
    ensureRace(new Ctx(state, "action:race2"), e, "PREFEITO", city);
    expect(race).toBeTruthy();
    const cand: CandidacyRow = {
      id: "cand_teste_apuracao",
      world_id: state.world.id,
      election_id: e.id,
      race_id: race.id,
      person_id: p.id,
      party_id: party.id,
      office_code: "VEREADOR",
      geo: city,
      status: "HOMOLOGADA",
      is_player: true,
      ballot_number: party.number * 100 + 77,
      campaign: emptyCampaign(),
      votes: 0,
      vote_share: 0,
      note: null,
    };
    state.t.candidacies.set(cand.id, cand);
    const before = state.world.game_date;
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(state.world.game_date).toBe(e.first_round);

    const night = electionNight(state, p.id, before, state.world.game_date);
    expect(night.length).toBeGreaterThanOrEqual(2);
    // a disputa do jogador vem primeiro, com nomes e votos e com ele na lista
    const mine = night[0];
    expect(mine.mine).toBe(true);
    expect(mine.kind).toBe("CANDIDATOS");
    expect(mine.rows.some((x) => x.me)).toBe(true);
    expect(mine.you?.votes).toBeGreaterThan(0);
    expect(["ELEITO", "SUPLENTE"]).toContain(mine.you?.outcome);
    expect(mine.rows.filter((x) => x.outcome === "ELEITO").length).toBeGreaterThan(0);
    // e a prefeitura da cidade no mesmo dia
    const pres = night.find((x) => x.title.startsWith("Prefeito"));
    expect(pres?.kind).toBe("CANDIDATOS");
    expect(pres!.rows.length).toBeGreaterThan(1);
    expect(pres!.rows.some((x) => x.outcome !== "NAO")).toBe(true);
    // dia sem votação: nada
    expect(electionNight(state, p.id, state.world.game_date, state.world.game_date)).toHaveLength(0);
    // resultado antigo, gravado só com os votos por partido: a apuração mostra as legendas e as cadeiras
    race.results.first!.candidates = [];
    const old = electionNight(state, p.id, before, state.world.game_date)[0];
    expect(old.kind).toBe("PARTIDOS");
    expect(old.rows.some((x) => x.me)).toBe(true);
    expect(old.rows.reduce((s, x) => s + (x.seats ?? 0), 0)).toBeGreaterThan(0);
    expect(old.you?.votes).toBeGreaterThan(0);
  });
});
