import { describe, expect, it } from "vitest";
import {
  capitalId,
  createCharacter,
  createRaces,
  Ctx,
  emptyCampaign,
  FREED_NOTE,
  joinParty,
  pendingFor,
  resolveStory,
  scheduleStory,
  storyDay,
  type CandidacyRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

let n = 0;

/** Candidato(a) a vereador homologado(a) em 2028, com a decisão de largada da campanha na tela. */
function kickoff(seed: string, opts: { money: number; energy: number; budget: number }) {
  const { state } = freshWorld(seed);
  const e = [...state.t.elections.values()].find((x) => x.year === 2028)!;
  createRaces(new Ctx(state, "action:setup"), e);
  state.world.game_date = e.calendar.conventionEnd;
  const ctx = new Ctx(state, "action:setup");
  const me = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000123", name: "Kauã Teste", uf: "PA", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {} }).person!;
  const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.PA ?? 0) - (a.territory.PA ?? 0))[0];
  joinParty(ctx, me, party);
  const city = capitalId("PA");
  const campaign = emptyCampaign();
  campaign.budget = opts.budget;
  campaign.fefc = opts.budget;
  const cand: CandidacyRow = { id: `cand_kick_${++n}`, world_id: state.world.id, election_id: e.id, race_id: `${e.id}:VEREADOR:${city}`, person_id: me.id, party_id: party.id, office_code: "VEREADOR", geo: city, status: "HOMOLOGADA", is_player: true, ballot_number: 65123, campaign, votes: 0, vote_share: 0, note: null };
  state.t.candidacies.set(cand.id, cand);
  const st = state.t.person_states.get(me.id)!;
  scheduleStory(st, "convencao_resultado", state.world.game_date, { cand: cand.id });
  storyDay(new Ctx(state, "tick"), me);
  const ev = st.story!.pending.find((x) => x.def === "convencao_resultado")!;
  expect(ev, "a decisão de largada chegou").toBeTruthy();
  expect(ev.blocking).toBe(true);
  st.money = opts.money;
  st.energy = opts.energy;
  return { state, me, st, cand, ev };
}

function answer(state: WorldState, personId: string, eventId: string, choice: string) {
  return resolveStory(new Ctx(state, `action:${personId}:${++n}`), personId, eventId, choice);
}

describe("decisão que segura o tempo nunca fica sem saída", () => {
  it("largada da campanha: sem energia, sem dinheiro e sem fundo, a largada simples (sem custo) segue disponível", () => {
    const { state, me, ev } = kickoff("sem-saida-simples", { money: 0, energy: 0, budget: 0 });
    const live = pendingFor(state, me.id).find((x) => x.id === ev.id)!;
    const by = Object.fromEntries(live.choices.map((ch) => [ch.id, ch.locked]));
    expect(by.lancamento).toContain("Exige");
    expect(by.rua).toContain("energia");
    expect(by.equipe).toContain("Faltam recursos");
    expect(by.simples).toBeNull();
    expect(answer(state, me.id, ev.id, "rua").ok).toBe(false);
    const r = answer(state, me.id, ev.id, "simples");
    expect(r.ok, r.message).toBe(true);
    expect(state.t.person_states.get(me.id)!.story!.pending.some((x) => x.id === ev.id)).toBe(false);
  });

  it("a coordenação profissional sai do caixa da campanha (fundo do partido), não do bolso", () => {
    const { state, me, st, cand, ev } = kickoff("sem-saida-fundo", { money: 300, energy: 0, budget: 446_526 });
    const live = pendingFor(state, me.id).find((x) => x.id === ev.id)!;
    expect(live.choices.find((ch) => ch.id === "equipe")!.locked).toBeNull();
    const r = answer(state, me.id, ev.id, "equipe");
    expect(r.ok, r.message).toBe(true);
    expect(cand.campaign.spent).toBeGreaterThan(0);
    expect(st.money).toBe(300);
  });

  it("decisão antiga, com todas as opções travadas agora: a opção padrão fica liberada", () => {
    const { state, me, st, ev } = kickoff("sem-saida-antiga", { money: 0, energy: 0, budget: 0 });
    // como a decisão ficou gravada antes da correção: três opções pagas, padrão = a última
    ev.choices = ev.choices.filter((ch) => ch.id !== "simples");
    ev.fallback = "equipe";
    const live = pendingFor(state, me.id).find((x) => x.id === ev.id)!;
    const freed = live.choices.filter((ch) => !ch.locked);
    expect(freed.map((ch) => ch.id)).toEqual(["equipe"]);
    expect(freed[0].freed).toBe(FREED_NOTE);
    // a gravação não muda só por olhar a tela
    expect(ev.choices.every((ch) => !ch.freed)).toBe(true);
    const no = answer(state, me.id, ev.id, "rua");
    expect(no.ok).toBe(false);
    expect(no.message).toContain("energia");
    const r = answer(state, me.id, ev.id, "equipe");
    expect(r.ok, r.message).toBe(true);
    expect(st.story!.pending.some((x) => x.id === ev.id)).toBe(false);
  });
});
