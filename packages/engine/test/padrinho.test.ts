import { describe, expect, it } from "vitest";
import {
  createCharacter,
  createRaces,
  Ctx,
  emptyCampaign,
  joinParty,
  patronChoices,
  patronOptions,
  performAction,
  playerListStrength,
  relKey,
  type CandidacyRow,
  type PersonRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

/** Jogador candidato a deputado(a) estadual no Ceará, com um senador fictício do partido e um candidato a governador da coligação. */
function setup(seed: string) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
  createRaces(ctx, e);
  e.status = "CAMPANHA";
  state.world.game_date = e.calendar.campaignStart;
  const parties = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.CE ?? 0) - (a.territory.CE ?? 0));
  const party = parties[0];
  const ally = parties.find((x) => x.id !== party.id && x.federation !== party.federation)!;
  const me = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000072", name: "João Teste", uf: "CE", age: 35, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
  joinParty(ctx, me, party);
  const race = state.t.races.get(`${e.id}:DEP_ESTADUAL:CE`)!;
  const c: CandidacyRow = { id: "cand_padrinho", world_id: state.world.id, election_id: e.id, race_id: race.id, person_id: me.id, party_id: party.id, office_code: "DEP_ESTADUAL", geo: "CE", status: "HOMOLOGADA", is_player: true, ballot_number: party.number * 1000 + 7, campaign: { ...emptyCampaign(), volunteers: 40 }, votes: 0, vote_share: 0, note: null };
  state.t.candidacies.set(c.id, c);
  const fictional = [...state.t.persons.values()].filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && !x.office_code);
  const senator = fictional[0];
  Object.assign(senator, { party_id: party.id, office_code: "SENADOR", office_geo: "CE", reputation: 70 });
  state.t.person_states.get(senator.id)!.reach.CE = 0.6;
  // candidato a governador de outro partido, com o partido do jogador na coligação
  const runner = fictional[1];
  Object.assign(runner, { party_id: ally.id });
  state.t.person_states.get(runner.id)!.reach.CE = 0.5;
  const gov: CandidacyRow = { id: "cand_gov_aliado", world_id: state.world.id, election_id: e.id, race_id: `${e.id}:GOVERNADOR:CE`, person_id: runner.id, party_id: ally.id, office_code: "GOVERNADOR", geo: "CE", status: "HOMOLOGADA", is_player: false, ballot_number: ally.number, campaign: { ...emptyCampaign(), coalition: [party.id] }, votes: 0, vote_share: 0, note: null };
  state.t.candidacies.set(gov.id, gov);
  // um deputado federal fictício do partido em outro estado (não cobre a disputa)
  const far = fictional[2];
  Object.assign(far, { party_id: party.id, office_code: "DEP_FEDERAL", office_geo: "SP" });
  return { state, e, me, c, senator, runner, gov, far, race };
}

function act(state: WorldState, me: PersonRow, n: number, params: Record<string, string>) {
  state.t.person_states.get(me.id)!.energy = 100;
  return performAction(new Ctx(state, `action:${me.id}:${n}`), me.id, "pedir_padrinho", params);
}

describe("padrinho político e dobradinha", () => {
  it("lista lideranças fictícias acima do cargo, do partido ou da coligação e na mesma região", () => {
    const { state, me, c, senator, runner, far } = setup("padrinho-lista");
    const list = patronChoices(new Ctx(state, "read"), me, c);
    const ids = list.map((x) => x.person.id);
    expect(ids).toContain(senator.id);
    expect(ids).toContain(runner.id);
    expect(ids).not.toContain(far.id);
    // pessoa real não apadrinha campanha de jogador
    expect(list.every((x) => x.person.kind === "FICTIONAL_GENERATED")).toBe(true);
    expect(list.find((x) => x.person.id === runner.id)!.role).toMatch(/^candidato\(a\) a governador/);
    expect(list.find((x) => x.person.id === senator.id)!.role).toMatch(/^senador/);
    // o mais popular soma mais; aliado de outro partido soma um pouco menos
    const s = list.find((x) => x.person.id === senator.id)!;
    expect(s.bonus).toBeGreaterThan(0.2);
    expect(patronOptions(new Ctx(state, "read"), me).some((o) => o.value === senator.id && o.label.includes("% de força"))).toBe(true);
  });

  it("aceito: a força na lista sobe, parte dos voluntários vai para o padrinho candidato e não dá para pedir de novo", () => {
    const { state, me, c, runner, gov, race } = setup("padrinho-aceito");
    const st = state.t.person_states.get(me.id)!;
    st.reach.CE = 0.9;
    st.political_capital = 100;
    me.reputation = 90;
    state.t.relationships.set(relKey(me.id, runner.id), { id: relKey(me.id, runner.id), world_id: state.world.id, a_id: me.id, b_id: runner.id, score: 100, interactions: 5, last_on: state.world.game_date });
    const before = playerListStrength(new Ctx(state, "read"), race, c, 0);
    const momentum = gov.campaign.momentum;
    const r = act(state, me, 1, { padrinho: runner.id });
    expect(r.ok, r.message).toBe(true);
    expect(r.message).toContain("padrinho político");
    expect(c.campaign.padrinho?.id).toBe(runner.id);
    const withPatron = playerListStrength(new Ctx(state, "read"), race, c, 0);
    expect(withPatron).toBeGreaterThan(before * 1.15);
    expect(c.campaign.volunteers).toBe(30);
    expect(gov.campaign.volunteers).toBe(10);
    expect(gov.campaign.momentum).toBeGreaterThan(momentum);
    expect(act(state, me, 2, { padrinho: runner.id }).ok).toBe(false);
    // se o padrinho sair da vida pública, o bônus some (e os voluntários cedidos não voltam)
    runner.status = "RETIRED";
    const after = playerListStrength(new Ctx(state, "read"), race, c, 0);
    expect(after).toBeLessThan(withPatron / 1.15);
    expect(after).toBeLessThanOrEqual(before);
  });

  it("recusa: escândalo afasta, a liderança não é chamada de novo e só vale para vereador e deputado", () => {
    const { state, me, c, senator } = setup("padrinho-recusa");
    const st = state.t.person_states.get(me.id)!;
    st.scandal = 90;
    st.political_capital = 0;
    me.reputation = 0;
    state.t.relationships.set(relKey(me.id, senator.id), { id: relKey(me.id, senator.id), world_id: state.world.id, a_id: me.id, b_id: senator.id, score: -100, interactions: 5, last_on: state.world.game_date });
    const r = act(state, me, 1, { padrinho: senator.id });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("recusou");
    expect(c.campaign.padrinho_refused).toContain(senator.id);
    expect(patronChoices(new Ctx(state, "read"), me, c).some((x) => x.person.id === senator.id)).toBe(false);
    // candidatura majoritária não tem padrinho
    c.office_code = "SENADOR";
    expect(act(state, me, 2, { padrinho: senator.id }).message).toContain("vereador ou deputado");
  });
});
