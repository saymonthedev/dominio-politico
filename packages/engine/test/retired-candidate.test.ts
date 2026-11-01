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
