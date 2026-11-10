import { describe, expect, it } from "vitest";
import {
  acceptanceProbability,
  clearPlayerData,
  clockPace,
  clockTarget,
  computeAffiliation,
  createCharacter,
  Ctx,
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
  const at = (iso: string) => Date.parse(iso);
  const from = (iso: string) => ({ anchor_real_at: iso, anchor_tick: 100, game_days_per_real_hour: SHARED_SPEED });

  it("de dia anda 2 meses a cada 2 horas (1 dia a cada 2 minutos)", () => {
    // 16h30 de Brasília (19h30 UTC)
    const w = from("2026-11-10T19:30:00.000Z");
    expect(clockTarget(w, at("2026-11-10T19:31:00.000Z"))).toBe(100);
    expect(clockTarget(w, at("2026-11-10T19:32:00.000Z"))).toBe(101);
    expect(clockTarget(w, at("2026-11-10T21:30:00.000Z"))).toBe(160);
    // antes da âncora não volta
    expect(clockTarget(w, at("2026-11-10T10:00:00.000Z"))).toBe(100);
  });

  it("de madrugada (0h às 7h de Brasília) anda 7 dias a cada 2 horas", () => {
    // 0h de Brasília (3h UTC)
    const w = from("2026-11-11T03:00:00.000Z");
    expect(clockTarget(w, at("2026-11-11T05:00:00.000Z"))).toBe(107);
    expect(clockTarget(w, at("2026-11-11T10:00:00.000Z"))).toBe(100 + 24);
    // das 6h às 8h: 1 hora de madrugada (3,5 dias) e 1 hora de dia (30 dias)
    const w2 = from("2026-11-11T09:00:00.000Z");
    expect(clockTarget(w2, at("2026-11-11T11:00:00.000Z"))).toBe(133);
    // um dia real inteiro: 7 h de madrugada e 17 h de dia
    expect(clockTarget(w, at("2026-11-12T03:00:00.000Z"))).toBe(100 + 534);
  });

  it("o ritmo muda às 7h e à meia-noite de Brasília", () => {
    const day = clockPace(at("2026-11-10T19:30:00.000Z"));
    expect(day).toMatchObject({ night: false, perHour: 30 });
    expect(new Date(day.changesAt).toISOString()).toBe("2026-11-11T03:00:00.000Z");
    const night = clockPace(at("2026-11-11T05:00:00.000Z"));
    expect(night).toMatchObject({ night: true, perHour: 3.5 });
    expect(new Date(night.changesAt).toISOString()).toBe("2026-11-11T10:00:00.000Z");
  });

  it("mundo só do jogador não anda sozinho", () => {
    const { state } = freshWorld("relogio-proprio");
    state.world.game_days_per_real_hour = 0;
    expect(targetTick(state, "2027-01-01T00:00:00.000Z")).toBe(state.world.anchor_tick);
  });

  it("com o relógio andando sozinho, só quem jogou nos últimos dias recebe acontecimentos sorteados", () => {
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
    // decisão sem resposta não vence sozinha: espera a volta do jogador
    const story = state.t.person_states.get(ativo.id)!.story!;
    expect(story.log.filter((e) => e.auto && e.kind !== "INFO")).toHaveLength(0);
  });
});
