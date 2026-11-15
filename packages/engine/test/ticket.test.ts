import { describe, expect, it } from "vitest";
import {
  ballotChoices,
  ballotNumber,
  coalitionChoices,
  contenderFor,
  createCharacter,
  Ctx,
  emptyCampaign,
  joinParty,
  performAction,
  type CandidacyRow,
  type OfficeCode,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

/** Filiado(a) ao PT com pré-candidatura (status PRE) na próxima eleição, num cargo escolhido. */
function preCandidate(seed: string, office: OfficeCode) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, {
    userId: "00000000-0000-0000-0000-000000000097",
    name: "Bia Teste",
    uf: "SC",
    age: 40,
    profession: "professor",
    origin: "classe_media",
    interests: [],
    ideology: { economy: -20 },
  });
  expect(r.ok, r.error).toBe(true);
  const p = r.person!;
  const st = state.t.person_states.get(p.id)!;
  const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && x.acronym === "PT")!;
  joinParty(ctx, p, party);
  st.energy = 100;
  st.political_capital = 60;
  const e = [...state.t.elections.values()].find((x) => x.status !== "ENCERRADA")!;
  const geo = office === "PREFEITO" || office === "VEREADOR" ? p.municipality : office === "PRESIDENTE" ? "BR" : p.uf;
  const cand: CandidacyRow = {
    id: `cand_teste_${office}`,
    world_id: state.world.id,
    election_id: e.id,
    race_id: `${e.id}:${office}:${geo}`,
    person_id: p.id,
    party_id: party.id,
    office_code: office,
    geo,
    status: "PRE",
    is_player: true,
    ballot_number: ballotNumber(ctx, party, office, `${e.id}:${office}:${geo}`, p.id),
    campaign: emptyCampaign(),
    votes: 0,
    vote_share: 0,
    note: null,
  };
  state.t.candidacies.set(cand.id, cand);
  return { state, p, st, party, cand, e };
}

const act = (state: WorldState, id: string, action: string, params: Record<string, string> = {}) => {
  const st = state.t.person_states.get(id)!;
  st.energy = 100;
  return performAction(new Ctx(state, `action:${id}:${st.action_seq}`), id, action, params);
};

describe("chapa: número, coligação, vice e suplentes", () => {
  it("números de urna no formato real e sem repetir na disputa", () => {
    const { state, party } = preCandidate("numeros", "VEREADOR");
    const ctx = new Ctx(state, "tick");
    expect(ballotNumber(ctx, party, "PREFEITO", "r", "x")).toBe(13);
    expect(String(ballotNumber(ctx, party, "SENADOR", "r", "x"))).toMatch(/^13\d$/);
    expect(String(ballotNumber(ctx, party, "DEP_FEDERAL", "r", "x"))).toMatch(/^13\d\d$/);
    expect(String(ballotNumber(ctx, party, "DEP_ESTADUAL", "r", "x"))).toMatch(/^13\d{3}$/);
    // o mesmo número não sai duas vezes na mesma disputa
    const mine = [...state.t.candidacies.values()][0];
    expect(ballotNumber(ctx, party, "VEREADOR", mine.race_id, mine.person_id)).not.toBe(mine.ballot_number);
  });

  it("vereador escolhe o próprio número entre os livres", () => {
    const { state, p, cand } = preCandidate("escolha", "VEREADOR");
    const options = ballotChoices(new Ctx(state, "tick"), cand);
    expect(options.length).toBeGreaterThan(5);
    const pick = options.find((o) => o.value !== String(cand.ballot_number))!;
    const r = act(state, p.id, "escolher_numero", { numero: pick.value });
    expect(r.ok, r.message).toBe(true);
    expect(cand.ballot_number).toBe(Number(pick.value));
    // vereador (proporcional) não forma coligação
    expect(act(state, p.id, "formar_coligacao", { partido: "x" }).ok).toBe(false);
  });

  it("prefeito forma coligação (sem quem tem candidato próprio), escolhe vice e fica mais forte nas urnas", () => {
    const { state, p, cand, party, e } = preCandidate("coligacao", "PREFEITO");
    const ctx = new Ctx(state, "tick");
    const before = contenderFor(ctx, cand, p.uf).partyStrength;

    // um partido com candidato próprio na mesma disputa não entra
    const rivalParty = coalitionChoices(ctx, cand)[0].party;
    state.t.candidacies.set("cand_rival", { ...cand, id: "cand_rival", person_id: "per_rival", party_id: rivalParty.id, is_player: false, ballot_number: rivalParty.number, campaign: emptyCampaign() });
    expect(coalitionChoices(new Ctx(state, "tick"), cand).some((x) => x.party.id === rivalParty.id)).toBe(false);

    const ally = coalitionChoices(new Ctx(state, "tick"), cand)[0].party;
    const r = act(state, p.id, "formar_coligacao", { partido: ally.id });
    expect(r.ok, r.message).toBe(true);
    expect(cand.campaign.coalition).toEqual([ally.id]);
    expect(contenderFor(new Ctx(state, "tick"), cand, p.uf).partyStrength).toBeGreaterThanOrEqual(before);

    const v = act(state, p.id, "escolher_vice", { pessoa: "novo" });
    expect(v.ok, v.message).toBe(true);
    const vice = state.t.persons.get(cand.campaign.vice!.id)!;
    expect(vice.kind).toBe("FICTIONAL_GENERATED");
    expect(vice.party_id).toBe(party.id);
    // senador não tem vice; prefeito não tem suplentes
    expect(act(state, p.id, "escolher_suplentes", { suplente1: "novo", suplente2: "novo" }).ok).toBe(false);
    expect(e.status).not.toBe("ENCERRADA");
  });

  it("senador escolhe dois suplentes diferentes", () => {
    const { state, p, cand } = preCandidate("suplentes", "SENADOR");
    const r = act(state, p.id, "escolher_suplentes", { suplente1: "novo", suplente2: "novo" });
    expect(r.ok, r.message).toBe(true);
    expect(cand.campaign.suplentes).toHaveLength(2);
    expect(cand.campaign.suplentes![0].id).not.toBe(cand.campaign.suplentes![1].id);
    expect(act(state, p.id, "escolher_vice", { pessoa: "novo" }).ok).toBe(false);
  });
});
