import { describe, expect, it } from "vitest";
import { canonicalGeo, createCharacter, Ctx, emptyCampaign, ensureRace, joinParty, performAction, scaledAmount, type CandidacyRow } from "../src";
import { freshWorld } from "./helpers";

describe("doação entre jogadores", () => {
  it("respeita o limite legal, entra no caixa da campanha e no mural de apoiadores", () => {
    const { state } = freshWorld("doacao");
    const mk = (uid: string, name: string) =>
      createCharacter(new Ctx(state, `action:setup:${uid}`), { userId: uid, name, uf: "SC", age: 35, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
    const cand = mk("00000000-0000-0000-0000-000000000081", "Ana Candidata");
    const donor = mk("00000000-0000-0000-0000-000000000082", "Beto Doador");
    const e = [...state.t.elections.values()].find((x) => x.year === 2028)!;
    const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO")[0];
    joinParty(new Ctx(state, "action:join"), cand, party);
    const city = canonicalGeo(cand.municipality);
    const race = ensureRace(new Ctx(state, "action:race"), e, "VEREADOR", city);
    const c: CandidacyRow = { id: "cand_doacao", world_id: state.world.id, election_id: e.id, race_id: race.id, person_id: cand.id, party_id: party.id, office_code: "VEREADOR", geo: city, status: "HOMOLOGADA", is_player: true, ballot_number: party.number * 100 + 11, campaign: emptyCampaign(), votes: 0, vote_share: 0, note: null };
    state.t.candidacies.set(c.id, c);
    const st = state.t.person_states.get(donor.id)!;
    st.money = 100_000;
    st.energy = 100;
    const act = (n: number, valor: number) => performAction(new Ctx(state, `action:${donor.id}:${n}`), donor.id, "doar_campanha", { candidatura: c.id, valor: String(valor) });

    // sem renda no ano, a lei não deixa doar
    st.income_last_year = 0;
    expect(act(1, scaledAmount(new Ctx(state, "v"), 1_000)).ok).toBe(false);
    // com renda de 60 mil, o limite é 6 mil
    st.income_last_year = 60_000;
    const v = scaledAmount(new Ctx(state, "v"), 5_000);
    const budget = c.campaign.budget;
    const r = act(2, v);
    expect(r.ok, r.message).toBe(true);
    expect(c.campaign.budget).toBe(budget + v);
    expect(c.campaign.supporters).toEqual([{ id: donor.id, name: donor.name, amount: v, on: state.world.game_date }]);
    expect(st.money).toBe(100_000 - v);
    // passou do limite: recusa
    expect(act(3, scaledAmount(new Ctx(state, "v"), 2_000)).ok).toBe(false);
    // não doa para si mesmo
    const self = performAction(new Ctx(state, `action:${cand.id}:1`), cand.id, "doar_campanha", { candidatura: c.id, valor: String(v) });
    expect(self.ok).toBe(false);
  });
});
