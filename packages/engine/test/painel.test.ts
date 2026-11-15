import { describe, expect, it } from "vitest";
import { runTicks } from "../src";
import { freshWorld } from "./helpers";

describe("números do painel /admin", () => {
  it("o motor guarda no mundo as contagens que o painel mostra (o banco não precisa contar)", () => {
    const { state } = freshWorld("painel");
    delete state.world.stats.n_persons;
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    const s = state.world.stats;
    expect(s.n_persons).toBe([...state.t.persons.values()].filter((p) => p.status === "ACTIVE").length);
    expect(s.n_acts).toBe(state.t.illicit_acts.size);
    expect(s.n_acts_found).toBe([...state.t.illicit_acts.values()].filter((a) => a.discovered).length);
    const inv = [...state.t.investigations.values()];
    expect(s.n_inv_open).toBe(inv.filter((i) => i.outcome == null).length);
    expect(s.n_inv_closed).toBe(inv.filter((i) => i.outcome != null).length);
    expect(s.n_convictions).toBe(inv.filter((i) => i.outcome === "CONDENADO").length);
    expect(s.n_parties_player).toBe([...state.t.parties.values()].filter((p) => p.founder_id && p.status !== "EXTINTO").length);
    expect(s.n_persons).toBeGreaterThan(1000);
  });
});
