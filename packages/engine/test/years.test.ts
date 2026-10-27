import { describe, expect, it } from "vitest";
import { runTicks, START_YEARS } from "../src";
import { freshWorld } from "./helpers";

const EXPECTED_PRESIDENT: Record<number, { incumbent: string; elected: string }> = {
  2002: { incumbent: "Fernando Henrique", elected: "Lula" },
  2006: { incumbent: "Lula", elected: "Lula" },
  2010: { incumbent: "Lula", elected: "Dilma" },
  2014: { incumbent: "Dilma", elected: "Dilma" },
  2018: { incumbent: "Michel Temer", elected: "Jair Bolsonaro" },
  2022: { incumbent: "Jair Bolsonaro", elected: "Lula" },
  2026: { incumbent: "Lula", elected: "Lula" },
};

describe.each(START_YEARS.map((y) => [y]))("ponto de partida %i", (year) => {
  it("sobe o snapshot real e simula até a posse do eleito", () => {
    const { state, changes } = freshWorld("anos", year);
    const exp = EXPECTED_PRESIDENT[year];
    expect(state.t.persons.get(state.world.gov.president_id!)?.name).toBe(exp.incumbent);
    const camara = [...state.t.parties.values()].reduce((s, p) => s + (p.seats.camara ?? 0), 0);
    expect(camara).toBe(513);
    const senado = [...state.t.parties.values()].reduce((s, p) => s + (p.seats.senado ?? 0), 0);
    expect(senado).toBe(81);
    expect(changes.get("news_articles").some((n) => n.factual)).toBe(true);
    // avança ~120 dias: passa pela posse de 1º de janeiro / 5 de janeiro
    const { ctx } = runTicks(state, { target: 120, maxTicks: 120 });
    expect(state.t.persons.get(state.world.gov.president_id!)?.name).toBe(exp.elected);
    expect(ctx.policyLog.filter((l) => !l.kind.startsWith("NPC_")).length).toBe(0);
  });
});
