import { describe, expect, it } from "vitest";
import {
  acceptanceProbability,
  addDays,
  clearPlayerData,
  computeAffiliation,
  createCharacter,
  Ctx,
  performAction,
  planAdvance,
  runTicks,
  worldPriceLevel,
  type ClockStatus,
} from "../src";
import { freshWorld } from "./helpers";

function player(seed: string, money?: number) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000088", name: "Rita Teste", uf: "BA", age: 33, profession: "professor", origin: "classe_media", interests: [], ideology: { economy: -20 } });
  expect(r.ok).toBe(true);
  const p = r.person!;
  const st = state.t.person_states.get(p.id)!;
  if (money !== undefined) st.money = money;
  return { state, ctx, p, st };
}

describe("filiação", () => {
  it("quem acabou de chegar não entra fácil; a trajetória abre as portas", () => {
    const { state, ctx, p, st } = player("filiacao-novato");
    const parties = [...state.t.parties.values()].filter((x) => x.status === "ATIVO");
    const best = () => Math.max(...parties.map((party) => acceptanceProbability(computeAffiliation(ctx, p, party, "PEDIDO").total)));
    expect(p.stage).toBe("CIDADAO");
    expect(best()).toBeLessThan(0.6);
    p.stage = "APROXIMACAO";
    st.activism = 30;
    p.reputation = 30;
    expect(best()).toBeGreaterThan(0.8);
  });
});

describe("inflação simulada", () => {
  it("o nível de preços acompanha o IPCA simulado de cada mês", () => {
    const { state } = freshWorld("precos");
    for (let i = 0; i < 3; i++) {
      const before = worldPriceLevel(state.world);
      const month = state.world.game_date.slice(0, 7);
      while (state.world.game_date.slice(0, 7) === month) runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
      expect(worldPriceLevel(state.world)).toBeCloseTo(before * (1 + state.economy.inflation_month / 100), 3);
    }
    expect(state.world.stats.price_level).toBeGreaterThan(0.9);
  });
});

describe("exclusão de conta", () => {
  it("limpa achados, ofertas e dinheiro não declarado e encerra a fundação de partido", () => {
    const { state, ctx, p, st } = player("conta", 2_000_000);
    p.reputation = 40;
    const r = performAction(ctx, p.id, "fundar_partido", { name: "Partido do Recôncavo", acronym: "PREC", number: "63", color: "#6a1b9a", entry: "ABERTO" });
    expect(r.ok, r.message).toBe(true);
    const party = [...state.t.parties.values()].find((x) => x.founder_id === p.id)!;
    st.dirty_money = 80_000;
    st.dossiers = { alvo: 0.6 };
    st.findings = { alvo: [{ kind: "RUMOR", text: "teste", date: state.world.game_date, verified: false }] } as unknown as typeof st.findings;
    clearPlayerData(new Ctx(state, "action:delete"), p.id);
    expect(st.dirty_money).toBe(0);
    expect(Object.keys(st.findings)).toHaveLength(0);
    expect(Object.keys(st.dossiers)).toHaveLength(0);
    expect(st.offers).toHaveLength(0);
    expect(party.status).toBe("EXTINTO");
  });
});

describe("relógio compartilhado", () => {
  const solo: ClockStatus = { others: [], shared: false, remaining: null, freesAt: null, recent: [], now: "2026-10-28T12:00:00.000Z" };
  const shared = (over: Partial<ClockStatus> = {}): ClockStatus => ({ ...solo, others: ["outro"], shared: true, remaining: 60, ...over });

  it("sozinho, avança sem limite", () => {
    const { state } = freshWorld("relogio-solo");
    expect(planAdvance(state, solo, state.world.game_date, 30)).toEqual({ ok: true, days: 30 });
  });

  it("com outros jogadores, respeita a cota de dias por hora", () => {
    const { state } = freshWorld("relogio-cota");
    const from = "2027-03-10";
    expect(planAdvance(state, shared({ remaining: 12 }), from, 30)).toMatchObject({ ok: true, days: 12 });
    expect(planAdvance(state, shared({ remaining: 0, freesAt: "2026-10-28T12:20:00.000Z" }), from, 7)).toMatchObject({ ok: false, days: 0 });
  });

  it("para na véspera de um marco e só o cruza 30 minutos depois do último avanço", () => {
    const { state } = freshWorld("relogio-marco");
    const election = [...state.t.elections.values()].filter((e) => e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0];
    const eve = addDays(election.first_round, -1);
    const stop = planAdvance(state, shared(), addDays(election.first_round, -10), 30);
    expect(stop).toMatchObject({ ok: true, days: 9 });
    expect(stop.stop?.label).toContain("1º turno");
    const recent = (minutesAgo: number) => [{ person_id: "outro", name: "Outro", days: 9, from: null, to: eve, at: new Date(Date.parse(solo.now) - minutesAgo * 60_000).toISOString() }];
    expect(planAdvance(state, shared({ recent: recent(5) }), eve, 7).ok).toBe(false);
    expect(planAdvance(state, shared({ recent: recent(40) }), eve, 7)).toMatchObject({ ok: true, days: 7 });
  });
});
