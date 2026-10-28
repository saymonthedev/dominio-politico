import { describe, expect, it } from "vitest";
import {
  addSignatures,
  commitCrime,
  createCharacter,
  crimeOpportunity,
  CRIMES,
  Ctx,
  gatherIntel,
  incomeTax,
  isReal,
  monthlyStatement,
  performAction,
  runTicks,
  spawnProceduralCadre,
  subsidyFor,
} from "../src";
import { freshWorld } from "./helpers";

function player(seed: string, extra: Partial<{ money: number; reputation: number }> = {}) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000077", name: "Clara Teste", uf: "MG", age: 45, profession: "advogado", origin: "classe_media", interests: [], ideology: { economy: -10 } });
  expect(r.ok).toBe(true);
  const p = r.person!;
  const st = state.t.person_states.get(p.id)!;
  if (extra.money !== undefined) st.money = extra.money;
  if (extra.reputation !== undefined) p.reputation = extra.reputation;
  return { state, ctx, p, st };
}

describe("crimes", () => {
  it("o catálogo cobre mais de vinte condutas, cada uma com lei, achados e diligências", () => {
    const defs = Object.values(CRIMES);
    expect(defs.length).toBeGreaterThanOrEqual(20);
    for (const d of defs) {
      expect(d.law(2026).length).toBeGreaterThan(5);
      expect(d.findings.length).toBeGreaterThan(0);
      expect(d.evidence.length).toBeGreaterThan(0);
    }
    expect(CRIMES.FRAUDE_LICITACAO.law(2018)).toContain("8.666");
    expect(CRIMES.FRAUDE_LICITACAO.law(2026)).toContain("14.133");
  });

  it("pessoas reais nunca são autoras, nem com o mundo rodando por anos", () => {
    const { state } = freshWorld("crimes-reais");
    while (state.world.game_date < "2029-01-15") runTicks(state, { target: state.world.tick + 90, maxTicks: 90 });
    const acts = [...state.t.illicit_acts.values()];
    expect(acts.length).toBeGreaterThan(10);
    for (const a of acts) expect(isReal(state.t.persons.get(a.person_id)?.kind ?? "PLAYER")).toBe(false);
    for (const i of state.t.investigations.values()) if (i.person_id) expect(isReal(state.t.persons.get(i.person_id)?.kind ?? "PLAYER")).toBe(false);
    const real = [...state.t.persons.values()].find((p) => isReal(p.kind) && p.office_code)!;
    expect(crimeOpportunity(new Ctx(state, "x"), real, "PROPINA")).toMatch(/reais/);
  }, 300_000);

  it("cargo define a oportunidade: rachadinha exige mandato legislativo", () => {
    const { ctx, p } = player("oportunidade");
    expect(crimeOpportunity(ctx, p, "RACHADINHA")).toMatch(/Exige o cargo/);
    p.office_code = "DEP_FEDERAL";
    p.office_geo = "MG";
    expect(crimeOpportunity(ctx, p, "RACHADINHA")).toBeNull();
    const r = performAction(ctx, p.id, "rachadinha");
    expect(r.ok).toBe(true);
    const act = [...ctx.t.illicit_acts.values()].find((a) => a.person_id === p.id && a.kind === "RACHADINHA")!;
    expect(act.ongoing).toBe(true);
    expect(act.monthly_gain).toBeGreaterThan(0);
  });

  it("o dossiê mostra o achado concreto de um crime que existe, e 'nada' quando não existe", () => {
    const { ctx, st } = player("dossie");
    const npc = spawnProceduralCadre(ctx, { partyId: [...ctx.t.parties.values()][0].id, uf: "MG", ideology: { economy: 0, social: 0, security: 0, institutions: 0, environment: 0, federalism: 0 }, roleLabel: "dirigente estadual", tier: 3 });
    npc.office_code = "PREFEITO";
    npc.office_geo = "3106200";
    commitCrime(ctx, npc, "FRAUDE_LICITACAO");
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      const r = gatherIntel(ctx, st, { person: npc }, ctx.rng("teste-intel", i), 1);
      found = r.found.some((f) => f.verified && f.crime === "FRAUDE_LICITACAO" && CRIMES.FRAUDE_LICITACAO.findings.includes(f.text));
    }
    expect(found).toBe(true);
    const clean = spawnProceduralCadre(ctx, { partyId: [...ctx.t.parties.values()][1].id, uf: "MG", ideology: { economy: 0, social: 0, security: 0, institutions: 0, environment: 0, federalism: 0 }, roleLabel: "quadro limpo", tier: 3 });
    const r = gatherIntel(ctx, st, { person: clean }, ctx.rng("teste-intel", "limpo"), 1);
    expect(r.found.every((f) => !f.act_id)).toBe(true);
    expect(r.level).toBeLessThan(0.15);
  });
});

describe("partido próprio", () => {
  it("funda, coleta apoio, passa pela conferência do TSE e vira presidente", () => {
    const { state, ctx, p, st } = player("fundacao", { money: 2_000_000, reputation: 40 });
    const r = performAction(ctx, p.id, "fundar_partido", { name: "Partido da Renovação Mineira", acronym: "PRM", number: "62", color: "#00838f", entry: "ABERTO" });
    expect(r.ok, r.message).toBe(true);
    const party = [...state.t.parties.values()].find((x) => x.founder_id === p.id)!;
    expect(party.status).toBe("EM_FORMACAO");
    expect(st.money).toBeLessThan(2_000_000);
    // repetir sigla ou número é recusado
    const dup = performAction(new Ctx(state, "action:dup"), p.id, "fundar_partido", { name: "Outro Nome Qualquer", acronym: "PT", number: "13", color: "#00838f", entry: "ABERTO" });
    expect(dup.ok).toBe(false);
    // apoio de sobra espalhado pelo país
    addSignatures(party, "BR", party.formation!.goal * 1.4);
    while (party.status === "EM_FORMACAO" && state.world.game_date < "2027-12-31") runTicks(state, { target: state.world.tick + 30, maxTicks: 30 });
    expect(party.status).toBe("ATIVO");
    expect(party.president_id).toBe(p.id);
    expect(p.party_id).toBe(party.id);
    expect(party.formation!.rejected).toBeGreaterThan(0);
  }, 300_000);
});

describe("dinheiro", () => {
  it("subsídio e imposto seguem cargo e época", () => {
    const { ctx, p, st } = player("financas");
    expect(Math.round(subsidyFor(ctx, "DEP_FEDERAL", "MG", "2026-11-01"))).toBe(46366);
    expect(Math.round(subsidyFor(ctx, "DEP_FEDERAL", "MG", "2010-06-01"))).toBe(16512);
    expect(subsidyFor(ctx, "DEP_ESTADUAL", "MG", "2026-11-01")).toBeCloseTo(46_366.19 * 0.75, 0);
    expect(incomeTax(4_800, "2026-06-01")).toBe(0);
    expect(incomeTax(4_800, "2025-06-01")).toBeGreaterThan(0);
    p.office_code = "DEP_FEDERAL";
    p.office_geo = "MG";
    const m = monthlyStatement(ctx, p, st);
    expect(m.items.some((i) => i.kind === "SUBSIDIO")).toBe(true);
    expect(m.items.some((i) => i.kind === "IMPOSTO" && i.amount < 0)).toBe(true);
  });

  it("dívida cobre o saldo negativo e cobra juros", () => {
    const { state, p, st } = player("divida");
    st.money = -10_000;
    const tick0 = state.world.game_date;
    while (state.world.game_date.slice(0, 7) === tick0.slice(0, 7) || state.world.game_date.slice(8) !== "02") runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(st.money).toBeGreaterThanOrEqual(0);
    expect(st.debt).toBeGreaterThan(0);
    expect(state.t.persons.get(p.id)).toBeTruthy();
  }, 120_000);
});
