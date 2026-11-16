import { describe, expect, it } from "vitest";
import { cityNow, createCharacter, Ctx, snapshotTerritory, StoryCtx, type RaceRow } from "../src";
import { cityMayor } from "../src/story/catalog/util";
import { cityOf } from "../src/story/world";
import { freshWorld } from "./helpers";

/** Jogador(a) numa cidade do interior e a eleição municipal de 2028 já calculada (posse em 2029). */
function setup(seed: string) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const p = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000094", name: "Rui Teste", uf: "GO", age: 40, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
  const st = state.t.person_states.get(p.id)!;
  const e = [...state.t.elections.values()].find((x) => x.year === 2028)!;
  e.summary = { ...e.summary, cityTerritory: snapshotTerritory(state.t.parties.values()) };
  e.status = "ENCERRADA";
  state.world.game_date = "2029-02-01";
  const city = cityOf(p);
  const story = () => {
    const c = new Ctx(state, "tick");
    return new StoryCtx(c, p, st, c.rng("teste", p.id));
  };
  return { state, p, st, e, city, story };
}

describe("prefeito(a) das histórias = prefeito(a) do mapa", () => {
  it("cidade com resultado calculado: a história usa uma figura com o nome e o partido do mapa, sempre a mesma", () => {
    const { state, city, story } = setup("prefeito-calculado");
    const map = cityNow(state, city)!.mayor!;
    expect(map.simulated).toBe(true);
    const a = cityMayor(story())!;
    expect(a.name).toBe(map.name);
    expect(a.party_id).toBe(map.partyId);
    expect(cityMayor(story())!.id).toBe(a.id);
  });

  it("eleito(a) no jogo que saiu da vida pública: o mapa mostra o nome do resultado (não o anterior) e a história fica sem prefeito", () => {
    const { state, e, city, story } = setup("prefeito-aposentado");
    const before = cityNow(state, city)!.mayor!;
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && x.id !== before.partyId)!;
    const race: RaceRow = {
      id: `${e.id}:PREFEITO:${city}`,
      world_id: state.world.id,
      election_id: e.id,
      office_code: "PREFEITO",
      geo: city,
      seats: 1,
      electorate: 100_000,
      status: "ENCERRADA",
      results: { first: { candidates: [{ candidacy_id: "cand_x", person_id: "per_saiu", name: "Adriana Teste Lima", party_id: party.id, votes: 50_000, share: 60 }], turnout: 0.8, invalid: 0, valid: 80_000 }, elected: ["per_saiu"] },
      latest_poll: null,
    };
    state.t.races.set(race.id, race);
    const now = cityNow(state, city)!.mayor!;
    expect(now.name).toBe("Adriana Teste Lima");
    expect(now.partyId).toBe(party.id);
    expect(now.personId).toBeNull();
    expect(cityMayor(story())).toBeUndefined();
  });
});
