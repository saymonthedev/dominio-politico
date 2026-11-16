import { describe, expect, it } from "vitest";
import { addDays, closeStalePre, createCharacter, createRaces, Ctx, joinParty, performAction } from "../src";
import { freshWorld } from "./helpers";

describe("pré-candidatura e convenção", () => {
  it("só até a véspera do fim das convenções; a que sobrar depois fecha com o motivo e o jogador volta a ser quadro", () => {
    const { state } = freshWorld("pre-convencao");
    const ctx = new Ctx(state, "action:setup");
    const p = createCharacter(ctx, {
      userId: "00000000-0000-0000-0000-000000000095",
      name: "Caio Teste",
      uf: "SP",
      age: 40,
      profession: "professor",
      origin: "classe_media",
      interests: [],
      ideology: {},
    }).person!;
    const st = state.t.person_states.get(p.id)!;
    joinParty(ctx, p, [...state.t.parties.values()].find((x) => x.status === "ATIVO" && x.acronym === "PSDB")!);
    const e = [...state.t.elections.values()].find((x) => x.year === 2030)!;
    createRaces(ctx, e);
    e.status = "CONVENCOES";
    const launch = (n: number) => {
      st.energy = 100;
      return performAction(new Ctx(state, `action:${p.id}:${n}`), p.id, "pre_candidatura", { office: "DEP_FEDERAL" });
    };

    // no último dia a convenção já rodou: uma pré-candidatura nova não seria avaliada
    state.world.game_date = e.calendar.conventionEnd;
    const late = launch(1);
    expect(late.ok).toBe(false);
    expect(late.message).toMatch(/convenções já terminaram/);

    // na véspera, pode
    state.world.game_date = addDays(e.calendar.conventionEnd, -1);
    const ok = launch(2);
    expect(ok.ok, ok.message).toBe(true);
    const cand = [...state.t.candidacies.values()].find((c) => c.person_id === p.id)!;
    expect(cand.status).toBe("PRE");
    expect(p.stage).toBe("PRE_CANDIDATO");

    // no dia da convenção ela ainda vai ser avaliada: nada muda
    state.world.game_date = e.calendar.conventionEnd;
    closeStalePre(new Ctx(state, "tick"));
    expect(cand.status).toBe("PRE");

    // se sobrou depois (como nas versões antigas), fecha com o motivo e o jogador deixa de ser pré-candidato
    state.world.game_date = addDays(e.calendar.conventionEnd, 1);
    closeStalePre(new Ctx(state, "tick"));
    expect(cand.status).toBe("INDEFERIDA");
    expect(cand.note).toMatch(/depois de o partido fechar a chapa/);
    expect(p.stage).toBe("QUADRO");
  });
});
