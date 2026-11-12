import { describe, expect, it } from "vitest";
import {
  acceptanceProbability,
  clearPlayerData,
  alignRounds,
  closeRound,
  clockTarget,
  enterPersonalDay,
  nextMilestones,
  personalDay,
  planRound,
  roundDays,
  roundDue,
  roundIndex,
  computeAffiliation,
  createCharacter,
  Ctx,
  performAction,
  runTicks,
  runTicksAsync,
  SHARED_SPEED,
  stepDays,
  stepDaysAsync,
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

describe("rodadas dos mundos compartilhados", () => {
  const at = (iso: string) => Date.parse(iso);
  const player = (seed: string) => {
    const { state } = freshWorld(seed);
    const r = createCharacter(new Ctx(state, "action:setup"), { userId: "00000000-0000-0000-0000-0000000000c1", name: "Rui Rodada", uf: "PE", age: 31, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
    expect(r.ok).toBe(true);
    return { state, id: r.person!.id };
  };

  it("rodadas de 2 horas: 2 meses de dia, 1 semana nas da madrugada", () => {
    // 16h de Brasília (19h UTC) e 2h de Brasília (5h UTC)
    expect(roundDays(roundIndex(at("2026-11-10T19:30:00.000Z")))).toBe(60);
    expect(roundDays(roundIndex(at("2026-11-11T05:10:00.000Z")))).toBe(7);
    expect(roundDays(roundIndex(at("2026-11-11T09:00:00.000Z")))).toBe(60);
    expect(roundIndex(at("2026-11-10T20:59:59.000Z"))).toBe(roundIndex(at("2026-11-10T19:00:00.000Z")));
    expect(roundIndex(at("2026-11-10T21:00:00.000Z"))).toBe(roundIndex(at("2026-11-10T19:00:00.000Z")) + 1);
  });

  it("a rodada termina no marco eleitoral que vier antes dos 2 meses", () => {
    const { state } = freshWorld("rodada-marco");
    const i = roundIndex(at("2026-11-10T19:30:00.000Z"));
    const plan = planRound(state, i);
    const m = nextMilestones(state, state.world.game_date)[0];
    const toMilestone = m ? Math.round((Date.parse(m.date) - Date.parse(state.world.game_date)) / 86_400_000) : Infinity;
    if (toMilestone <= 60) {
      expect(plan.until).toBe(state.world.tick + toMilestone);
      expect(plan.cap).toBe(plan.until - 1);
      expect(plan.milestone?.date).toBe(m!.date);
    } else {
      expect(plan).toMatchObject({ until: state.world.tick + 60, cap: state.world.tick + 60, milestone: null });
    }
  });

  it("o mundo fica parado na rodada e anda até o fim dela na virada", () => {
    const { state } = freshWorld("rodada-virada");
    const now = at("2026-11-10T19:30:00.000Z");
    expect(alignRounds(state, now)).toBe(true);
    expect(alignRounds(state, now)).toBe(false);
    const until = state.world.stats.round_until;
    expect(roundDue(state.world, now)).toBe(false);
    expect(clockTarget(state.world, now)).toBe(state.world.tick);
    // virou a rodada (18h de Brasília): o mundo precisa chegar ao fim dela
    const later = at("2026-11-10T21:05:00.000Z");
    expect(roundDue(state.world, later)).toBe(true);
    expect(clockTarget(state.world, later)).toBe(until);
    runTicks(state, { target: until, maxTicks: 90 });
    closeRound(state);
    expect(state.world.tick).toBe(until);
    expect(roundDue(state.world, later)).toBe(false);
    expect(state.world.stats.round_until).toBeGreaterThan(until);
  });

  it("cada jogador vive os próprios dias sem mover o mundo, até o fim da rodada", () => {
    const { state, id } = player("rodada-pessoal");
    alignRounds(state, at("2026-11-10T19:30:00.000Z"));
    const tick = state.world.tick;
    const date = state.world.game_date;
    const st = state.t.person_states.get(id)!;
    st.energy = 10;
    const r = stepDays(state, id, { days: 5, personalCap: state.world.stats.round_cap });
    // para antes se aparece uma decisão nova (como no "viver os dias" de sempre)
    expect(r.ticks).toBeGreaterThan(0);
    expect([null, "decisao"]).toContain(r.stop);
    expect(state.world.tick).toBe(tick);
    expect(state.world.game_date).toBe(date);
    expect(personalDay(state, id).tick).toBe(tick + r.ticks);
    expect(st.energy).toBeGreaterThan(10);
    // ação ou decisão: o mundo vai para o dia do jogador e volta
    const back = enterPersonalDay(state, id)!;
    expect(state.world.tick).toBe(tick + r.ticks);
    back();
    expect(state.world.tick).toBe(tick);
    // não passa do último dia da rodada
    const cap = state.world.stats.round_cap;
    const rest = stepDays(state, id, { days: 400, personalCap: cap });
    expect(rest.stop === "rodada" || rest.stop === "decisao" || rest.stop === "fim").toBe(true);
    expect(personalDay(state, id).tick).toBeLessThanOrEqual(cap);
  });

  it("na virada, quem já viveu os dias não recupera a energia de novo", () => {
    const { state, id } = player("rodada-energia");
    alignRounds(state, at("2026-11-10T19:30:00.000Z"));
    const st = state.t.person_states.get(id)!;
    const lived = stepDays(state, id, { days: 3, personalCap: state.world.stats.round_cap }).ticks;
    expect(lived).toBeGreaterThan(0);
    st.energy = 5;
    // o mundo anda os dias que o jogador já viveu: a energia gasta continua gasta
    runTicks(state, { target: state.world.tick + lived, maxTicks: lived });
    expect(st.energy).toBe(5);
    // o dia seguinte ninguém viveu: aí o dia do mundo devolve a energia
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(st.energy).toBeGreaterThan(5);
  });

  it("na virada, o dia do mundo não mexe na história de quem não jogou", () => {
    const { state, id } = player("rodada-ausente");
    alignRounds(state, at("2026-11-10T19:30:00.000Z"));
    const st = state.t.person_states.get(id)!;
    // nenhum acontecimento chega nem vence (o mundo pode deixar continuações na fila, que só
    // aparecem quando o jogador viver um dia); a família e as contas do mês andam no dia do mundo
    const story = () => JSON.stringify({ pending: st.story?.pending ?? [], log: st.story?.log ?? [], seen: st.story?.seen ?? {}, last: st.story?.lastEvent ?? null });
    const before = story();
    runTicks(state, { target: state.world.tick + 20, maxTicks: 20 });
    expect(story()).toBe(before);
  });

  it("mundo só do jogador não anda sozinho", () => {
    const { state } = freshWorld("relogio-proprio");
    state.world.game_days_per_real_hour = 0;
    expect(targetTick(state, "2027-01-01T00:00:00.000Z")).toBe(state.world.tick);
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

describe("dias com pausa no servidor", () => {
  const pause = () => new Promise<void>((ok) => setImmediate(ok));

  it("andar os dias com pausas dá exatamente o mesmo mundo", async () => {
    const a = freshWorld("pausas").state;
    const b = freshWorld("pausas").state;
    const ra = runTicks(a, { target: a.world.tick + 12, maxTicks: 12 });
    const rb = await runTicksAsync(b, { target: b.world.tick + 12, maxTicks: 12 }, pause);
    expect(rb.ticks).toBe(ra.ticks);
    expect(b.world.game_date).toBe(a.world.game_date);
    expect(JSON.stringify(b.world.gov)).toBe(JSON.stringify(a.world.gov));
    expect(rb.ctx.changes.count()).toBe(ra.ctx.changes.count());
  });

  it("viver os dias com pausas dá o mesmo diário e devolve quem estava vivendo", async () => {
    const mk = () => {
      const { state } = freshWorld("pausas-vida");
      const r = createCharacter(new Ctx(state, "action:setup"), { userId: "00000000-0000-0000-0000-0000000000b1", name: "Lia Pausa", uf: "RJ", age: 29, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
      return { state, id: r.person!.id };
    };
    const a = mk();
    const b = mk();
    const ra = stepDays(a.state, a.id, { days: 10 });
    const rb = await stepDaysAsync(b.state, b.id, { days: 10 }, pause);
    expect(rb.days.map((d) => d.line)).toEqual(ra.days.map((d) => d.line));
    expect(rb.stop).toBe(ra.stop);
    expect(b.state.focus).toBeUndefined();
  });
});
