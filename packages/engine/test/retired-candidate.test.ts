import { describe, expect, it } from "vitest";
import { OFFICES, runTicks } from "../src";
import { freshWorld } from "./helpers";

describe("candidato que sai da vida pública no meio da campanha", () => {
  it("pesquisas e apuração seguem (o dia não trava) e a candidatura é encerrada", () => {
    const { state } = freshWorld("candidato-aposentado");
    // candidatura homologada de uma disputa majoritária (prefeitura): entra nas pesquisas e na apuração
    const pick = () =>
      [...state.t.candidacies.values()].find((c) => {
        const race = state.t.races.get(c.race_id);
        return c.status === "HOMOLOGADA" && !c.is_player && !!race && OFFICES[race.office_code].system === "MAJORITARIO";
      });
    for (let i = 0; i < 60 && !pick(); i++) runTicks(state, { target: state.world.tick + 30, maxTicks: 30 });
    const cand = pick();
    expect(cand).toBeTruthy();
    const election = state.t.elections.get(cand!.election_id)!;
    // aposentado/condenado: a carga do mundo não traz quem não está ativo, mas a candidatura ficou aberta
    state.t.persons.delete(cand!.person_id);
    state.t.person_states.delete(cand!.person_id);
    expect(() => {
      while (state.world.game_date <= election.first_round) runTicks(state, { target: state.world.tick + 7, maxTicks: 7 });
    }).not.toThrow();
    expect(state.t.candidacies.get(cand!.id)?.status).toBe("DESISTENTE");
  }, 180_000);
});

describe("debate com participante que saiu da vida pública", () => {
  it("o debate acontece sem ele (o dia não trava)", () => {
    const { state } = freshWorld("debate-aposentado");
    const scheduled = () => [...state.t.debates.values()].find((d) => d.status === "AGENDADO" && d.participants.length >= 2 && d.scheduled_on > state.world.game_date);
    for (let i = 0; i < 140 && !scheduled(); i++) runTicks(state, { target: state.world.tick + 15, maxTicks: 15 });
    const debate = scheduled();
    expect(debate).toBeTruthy();
    const gone = state.t.candidacies.get(debate!.participants[0])!;
    state.t.persons.delete(gone.person_id);
    state.t.person_states.delete(gone.person_id);
    expect(() => {
      while (state.world.game_date <= debate!.scheduled_on) runTicks(state, { target: state.world.tick + 3, maxTicks: 3 });
    }).not.toThrow();
    expect(state.t.debates.get(debate!.id)?.status === "AGENDADO").toBe(false);
  }, 180_000);
});
