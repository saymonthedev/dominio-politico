import { describe, expect, it } from "vitest";
import {
  capitalId,
  contenderFor,
  createCharacter,
  createRaces,
  Ctx,
  emptyCampaign,
  endorseTargets,
  joinParty,
  performAction,
  playerListStrength,
  runConventions,
  settleEndorsements,
  successorChoices,
  weeklySupportRequests,
  type CandidacyRow,
  type PersonRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

let n = 0;
function player(state: WorldState, name: string, uf = "CE"): PersonRow {
  const ctx = new Ctx(state, "action:setup");
  return createCharacter(ctx, { userId: `00000000-0000-0000-0000-0000000008${String(++n).padStart(2, "0")}`, name, uf, age: 45, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
}

function act(state: WorldState, p: PersonRow, id: string, params: Record<string, string>) {
  state.t.person_states.get(p.id)!.energy = 100;
  return performAction(new Ctx(state, `action:${p.id}:${++n}`), p.id, id, params);
}

function candidacy(state: WorldState, e: { id: string }, p: PersonRow, office: CandidacyRow["office_code"], geo: string, partyId: string, status: CandidacyRow["status"] = "HOMOLOGADA", isPlayer = false): CandidacyRow {
  const c: CandidacyRow = { id: `cand_t_${++n}`, world_id: state.world.id, election_id: e.id, race_id: `${e.id}:${office}:${geo}`, person_id: p.id, party_id: partyId, office_code: office, geo, status, is_player: isPlayer, ballot_number: 10 + n, campaign: emptyCampaign(), votes: 0, vote_share: 0, note: null };
  state.t.candidacies.set(c.id, c);
  return c;
}

/** Eleição de 2030 em campanha, com um candidato fictício a governador do Ceará pelo partido do jogador. */
function campaign(seed: string) {
  const { state } = freshWorld(seed);
  const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
  createRaces(new Ctx(state, "action:setup"), e);
  e.status = "CAMPANHA";
  state.world.game_date = e.calendar.campaignStart;
  const parties = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.CE ?? 0) - (a.territory.CE ?? 0));
  const [mine, rival] = parties;
  const fictional = [...state.t.persons.values()].filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && !x.office_code);
  const gov = fictional[0];
  Object.assign(gov, { party_id: mine.id, uf: "CE" });
  const govCand = candidacy(state, e, gov, "GOVERNADOR", "CE", mine.id);
  const other = fictional[1];
  Object.assign(other, { party_id: rival.id, uf: "CE" });
  const otherCand = candidacy(state, e, other, "GOVERNADOR", "CE", rival.id);
  const me = player(state, "Rian Teste");
  joinParty(new Ctx(state, "action:setup"), me, mine);
  const st = state.t.person_states.get(me.id)!;
  st.reach.CE = 0.6;
  me.reputation = 70;
  return { state, e, mine, rival, gov, govCand, other, otherCand, me, st };
}

describe("apoio a candidaturas", () => {
  it("declarar apoio soma no fôlego da campanha, uma vez por disputa, e quem disputa a vaga não apoia rival", () => {
    const { state, govCand, otherCand, me } = campaign("apoio-declarar");
    const before = contenderFor(new Ctx(state, "read"), govCand, "CE").momentum;
    const r = act(state, me, "declarar_apoio", { candidatura: govCand.id });
    expect(r.ok, r.message).toBe(true);
    expect(govCand.campaign.apoios?.[0]).toMatchObject({ id: me.id, kind: "APOIO" });
    expect(contenderFor(new Ctx(state, "read"), govCand, "CE").momentum).toBeGreaterThan(before + 0.1);
    // a mesma disputa não aceita um segundo apoio
    expect(endorseTargets(new Ctx(state, "read"), me).some((c) => c.id === otherCand.id)).toBe(false);
    expect(act(state, me, "declarar_apoio", { candidatura: otherCand.id }).ok).toBe(false);
  });

  it("apoiar o rival de quem o próprio partido lançou desagrada a direção", () => {
    const { state, otherCand, me, st } = campaign("apoio-rival");
    const standing = st.party_standing;
    const r = act(state, me, "declarar_apoio", { candidatura: otherCand.id });
    expect(r.ok).toBe(true);
    expect(r.message).toContain("direção");
    expect(st.party_standing).toBe(Math.max(0, standing - 15));
  });

  it("depois da votação: prestígio se o apoiado vence, desgaste se perde, uma vez só", () => {
    const { state, e, govCand, me, st } = campaign("apoio-acerto");
    expect(act(state, me, "declarar_apoio", { candidatura: govCand.id }).ok).toBe(true);
    const capital = st.political_capital;
    govCand.status = "ELEITO";
    settleEndorsements(new Ctx(state, "tick"), e);
    expect(st.political_capital).toBe(Math.min(100, capital + 4));
    expect(govCand.campaign.apoios?.[0].settled).toBe(true);
    settleEndorsements(new Ctx(state, "tick"), e);
    expect(st.political_capital).toBe(Math.min(100, capital + 4));
  });

  it("candidatos fictícios da região pedem apoio a quem tem mandato; aceitar declara o apoio", () => {
    const { state, govCand, me, st } = campaign("apoio-pedido");
    Object.assign(me, { office_code: "VEREADOR", office_geo: capitalId("CE") });
    let pedidos = 0;
    for (let i = 0; i < 30 && !pedidos; i++) {
      state.world.tick += 1;
      weeklySupportRequests(new Ctx(state, "tick"));
      pedidos = st.story?.apoio_pedidos?.length ?? 0;
    }
    expect(pedidos).toBe(1);
    const req = st.story!.apoio_pedidos![0];
    expect(req.cand).toBe(govCand.id);
    const r = act(state, me, "responder_pedido_apoio", { pedido: req.id, resposta: "aceitar" });
    expect(r.ok, r.message).toBe(true);
    expect(govCand.campaign.apoios?.some((a) => a.id === me.id)).toBe(true);
    expect(st.story!.apoio_pedidos).toHaveLength(0);
  });

  it("apoio de um jogador também soma na força da lista de quem disputa deputado", () => {
    const { state, e, mine, me } = campaign("apoio-lista");
    const dep = player(state, "Deputada Teste");
    joinParty(new Ctx(state, "action:setup"), dep, mine);
    const c = candidacy(state, e, dep, "DEP_FEDERAL", "CE", mine.id, "HOMOLOGADA", true);
    const race = state.t.races.get(c.race_id)!;
    const before = playerListStrength(new Ctx(state, "read"), race, c, 0);
    expect(act(state, me, "declarar_apoio", { candidatura: c.id }).ok).toBe(true);
    expect(playerListStrength(new Ctx(state, "read"), race, c, 0)).toBeGreaterThan(before * 1.1);
  });
});

describe("sucessor indicado por quem tem o cargo", () => {
  it("o prefeito que não concorre indica um nome do partido, que ganha a convenção e leva o apoio", () => {
    const { state } = freshWorld("sucessor");
    const e = [...state.t.elections.values()].find((x) => x.year === 2028)!;
    createRaces(new Ctx(state, "action:setup"), e);
    state.world.game_date = "2028-03-01";
    const city = capitalId("CE");
    const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.CE ?? 0) - (a.territory.CE ?? 0))[3];
    const mayor = player(state, "Prefeito Teste");
    joinParty(new Ctx(state, "action:setup"), mayor, party);
    Object.assign(mayor, { office_code: "PREFEITO", office_geo: city, municipality: city });
    const heir = [...state.t.persons.values()].find((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && !x.office_code && 2028 - x.birth_year >= 30)!;
    Object.assign(heir, { party_id: party.id, uf: "CE", municipality: city, reputation: 10 });
    state.t.person_states.get(heir.id)!.filiation_date = "2020-01-01";
    const choices = successorChoices(new Ctx(state, "read"), mayor);
    expect(choices.map((x) => x.person.id)).toContain(heir.id);
    const r = act(state, mayor, "indicar_sucessor", { pessoa: heir.id });
    expect(r.ok, r.message).toBe(true);
    const pre = [...state.t.candidacies.values()].find((c) => c.person_id === heir.id && c.election_id === e.id)!;
    expect(pre).toMatchObject({ status: "PRE", office_code: "PREFEITO", geo: city, party_id: party.id });
    expect(pre.campaign.apoios?.[0]).toMatchObject({ id: mayor.id, kind: "SUCESSOR" });
    // não indica duas vezes
    expect(act(state, mayor, "indicar_sucessor", { pessoa: heir.id }).ok).toBe(false);
    // a convenção do partido escolhe o sucessor, mesmo com reputação baixa
    e.status = "CONVENCOES";
    state.world.game_date = e.calendar.conventionEnd;
    runConventions(new Ctx(state, "tick"), e);
    expect(pre.status).toBe("HOMOLOGADA");
    expect([...state.t.candidacies.values()].filter((c) => c.race_id === pre.race_id && c.party_id === party.id && c.status === "HOMOLOGADA").map((c) => c.person_id)).toEqual([heir.id]);
  });
});
