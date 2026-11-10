import { describe, expect, it } from "vitest";
import {
  acceptanceProbability,
  clearPlayerData,
  clockTarget,
  computeAffiliation,
  createCharacter,
  Ctx,
  nextClockStep,
  performAction,
  runTicks,
  SHARED_SPEED,
  targetTick,
  worldPriceLevel,
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

describe("relógio dos mundos compartilhados", () => {
  // 16h30 de Brasília (19h30 UTC)
  const anchor = { anchor_real_at: "2026-11-10T19:30:00.000Z", anchor_tick: 100, game_days_per_real_hour: SHARED_SPEED };
  const at = (iso: string) => Date.parse(iso);

  it("anda 7 dias a cada hora par de Brasília, nunca no meio", () => {
    expect(clockTarget(anchor, at("2026-11-10T19:30:00.000Z"))).toBe(100);
    expect(clockTarget(anchor, at("2026-11-10T20:59:59.000Z"))).toBe(100);
    // 18h de Brasília
    expect(clockTarget(anchor, at("2026-11-10T21:00:00.000Z"))).toBe(107);
    expect(clockTarget(anchor, at("2026-11-10T22:59:00.000Z"))).toBe(107);
    // 20h e, um dia depois, 12 saltos a mais
    expect(clockTarget(anchor, at("2026-11-10T23:00:00.000Z"))).toBe(114);
    expect(clockTarget(anchor, at("2026-11-11T23:00:00.000Z"))).toBe(114 + 12 * 7);
    // antes da âncora não volta
    expect(clockTarget(anchor, at("2026-11-10T10:00:00.000Z"))).toBe(100);
  });

  it("o próximo salto é na próxima hora par de Brasília", () => {
    expect(new Date(nextClockStep(at("2026-11-10T19:30:00.000Z"))).toISOString()).toBe("2026-11-10T21:00:00.000Z");
    expect(new Date(nextClockStep(at("2026-11-10T21:00:00.000Z"))).toISOString()).toBe("2026-11-10T23:00:00.000Z");
    expect(new Date(nextClockStep(at("2026-11-11T02:10:00.000Z"))).toISOString()).toBe("2026-11-11T03:00:00.000Z");
  });

  it("mundo só do jogador não anda sozinho", () => {
    const { state } = freshWorld("relogio-proprio");
    state.world.game_days_per_real_hour = 0;
    expect(targetTick(state, "2027-01-01T00:00:00.000Z")).toBe(state.world.anchor_tick);
  });

  it("nos saltos, só quem jogou nos últimos dias recebe acontecimentos sorteados", () => {
    const { state } = freshWorld("relogio-vivendo");
    const make = (id: string, name: string) => {
      const r = createCharacter(new Ctx(state, `action:setup-${id}`), { userId: id, name, uf: "SP", age: 30, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
      expect(r.ok).toBe(true);
      return r.person!;
    };
    const ativo = make("00000000-0000-0000-0000-0000000000a1", "Clara Ativa");
    const ausente = make("00000000-0000-0000-0000-0000000000a2", "Bruno Ausente");
    state.living = new Set([ativo.id]);
    runTicks(state, { target: state.world.tick + 42, maxTicks: 42 });
    state.living = undefined;
    const fired = (id: string) => Object.values(state.t.person_states.get(id)!.story?.seen ?? {}).reduce((n, x) => n + x.n, 0);
    expect(fired(ativo.id)).toBeGreaterThan(0);
    expect(fired(ausente.id)).toBeLessThan(fired(ativo.id));
    // decisão sem resposta não vence sozinha nos saltos: espera a volta do jogador
    const story = state.t.person_states.get(ativo.id)!.story!;
    expect(story.log.filter((e) => e.auto && e.kind !== "INFO")).toHaveLength(0);
  });
});
