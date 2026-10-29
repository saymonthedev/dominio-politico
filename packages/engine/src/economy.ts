import { applyMonthlyInflation } from "./finance";
import { addMonths, day, month, monthKey, type ISODate } from "./calendar";
import { UF_BY_CODE } from "./geo";
import type { Ctx } from "./state";
import type { EconomyRow } from "./types";

/**
 * Modelagem de jogo — não previsão do IBGE, BCB ou Tesouro. Os dados oficiais
 * servem só como condição inicial; depois, a economia pertence à linha do tempo
 * alternativa. Coeficientes ficam nesta tabela para balanceamento.
 */
export const ECON_PARAMS = {
  potentialGrowth: 2.0,
  fiscalMultiplier: 0.6,
  realRateNeutral: 5.0,
  realRateEffect: 0.25,
  confidenceEffect: 0.8,
  externalEffect: 0.7,
  inflationPenalty: 0.15,
  inflationPersistence: 0.75,
  gapPassThrough: 0.25,
  fxPassThrough: 0.06,
  inflationTarget: 3.0,
  okun: 0.035,
  naturalUnemployment: 6.5,
  unemploymentReversion: 0.01,
  gapDecay: 0.85,
  taylorInflation: 1.5,
  taylorGap: 0.5,
  copomStep: 0.5,
  primaryFromCycle: 0.15,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Datas aproximadas das 8 reuniões anuais do Copom. */
const COPOM_DAYS: Array<[number, number]> = [[1, 28], [3, 18], [5, 6], [6, 17], [7, 29], [9, 16], [11, 4], [12, 9]];

export function isCopomDay(d: ISODate): boolean {
  return COPOM_DAYS.some(([m, dd]) => month(d) === m && day(d) === dd);
}

/** Passo mensal. */
export function stepEconomy(prev: EconomyRow, inputs: { fiscalStance: number; shocks: { supply: number; external: number; productivity: number; confidence: number } }, nextMonth: string, worldId: string): EconomyRow {
  const p = ECON_PARAMS;
  const realRate = prev.selic - prev.expectations;
  const externalDemand = clamp(prev.external_demand * 0.8 + inputs.shocks.external, -3, 3);
  const productivity = clamp(prev.productivity * 0.98 + inputs.shocks.productivity, -1.5, 1.5);
  const confidence = clamp(prev.confidence * 0.9 + 5 + inputs.shocks.confidence + (prev.gdp_growth - p.potentialGrowth) * 0.8, 10, 90);
  const fiscalImpulse = clamp(prev.fiscal_impulse * 0.7 + inputs.fiscalStance * 0.3, -2, 2);

  // crescimento = potencial + impulso fiscal − juros reais + produtividade + demanda externa + confiança − inflação + choque
  const target =
    p.potentialGrowth +
    p.fiscalMultiplier * fiscalImpulse -
    p.realRateEffect * (realRate - p.realRateNeutral) +
    productivity +
    p.externalEffect * externalDemand * 0.5 +
    p.confidenceEffect * ((confidence - 50) / 25) -
    p.inflationPenalty * Math.max(0, prev.inflation_12m - 6) -
    inputs.shocks.supply * 0.3;
  const growth = clamp(prev.gdp_growth * 0.8 + target * 0.2, -8, 9);
  const outputGap = clamp(prev.output_gap * p.gapDecay + (growth - p.potentialGrowth) / 12, -6, 6);

  // inflação = persistência + hiato + repasse cambial + expectativas + choque de oferta
  const fx = clamp(prev.fx * (1 + (-externalDemand * 0.004 + (prev.debt_gdp - 80) * 0.0003 - (realRate - 6) * 0.002)), 2, 12);
  const fxChange = (fx / prev.fx - 1) * 100;
  const inflation = clamp(
    p.inflationPersistence * prev.inflation_12m +
      (1 - p.inflationPersistence) * prev.expectations +
      p.gapPassThrough * outputGap +
      p.fxPassThrough * fxChange * 12 * 0.1 +
      inputs.shocks.supply,
    -2,
    40,
  );
  const expectations = clamp(prev.expectations * 0.85 + 0.1 * inflation + 0.05 * p.inflationTarget, 0, 30);

  // desemprego = anterior − resposta ao crescimento + choque (com reversão lenta à taxa natural)
  const unemployment = clamp(
    prev.unemployment - p.okun * (growth - p.potentialGrowth) + p.unemploymentReversion * (p.naturalUnemployment - prev.unemployment) * 0.3,
    2.5,
    25,
  );

  // dívida/PIB seguinte = dinâmica juros-crescimento − resultado primário + reavaliação
  const primary = clamp(prev.primary_balance * 0.9 + (-fiscalImpulse * 0.4 + p.primaryFromCycle * (growth - p.potentialGrowth)) * 0.1, -6, 5);
  const nominalGrowth = growth + inflation;
  const debt = clamp(prev.debt_gdp * (1 + (prev.selic * 0.85 - nominalGrowth) / 1200) - primary / 12 + fxChange * 0.02, 20, 200);

  return {
    id: `eco_${worldId}_${nextMonth}`,
    world_id: worldId,
    month: nextMonth,
    gdp_growth: r2(growth),
    gdp_level: r2(prev.gdp_level * (1 + (growth + inflation) / 1200)),
    inflation_12m: r2(inflation),
    inflation_month: r2(inflation / 12 + inputs.shocks.supply * 0.1),
    unemployment: r2(unemployment),
    selic: prev.selic,
    debt_gdp: r2(debt),
    primary_balance: r2(primary),
    confidence: r2(confidence),
    fx: r2(fx),
    external_demand: r2(externalDemand),
    fiscal_impulse: r2(fiscalImpulse),
    output_gap: r2(outputGap),
    productivity: r2(productivity),
    supply_shock: r2(inputs.shocks.supply * 0.5),
    expectations: r2(expectations),
  };
}

/** Regra de Taylor com passos graduais. */
export function copomDecision(e: EconomyRow): number {
  const p = ECON_PARAMS;
  const target = p.realRateNeutral + e.expectations + p.taylorInflation * (e.inflation_12m - p.inflationTarget) * 0.5 + p.taylorGap * e.output_gap;
  const diff = clamp(target, 2, 30) - e.selic;
  if (Math.abs(diff) < 0.25) return 0;
  const step = Math.min(Math.abs(diff), diff > 0 ? 1.0 : 0.75);
  return Math.round((Math.sign(diff) * step) / 0.25) * 0.25;
}

export interface EconShock {
  key: string;
  title: string;
  body: string;
  prob: number;
  supply?: number;
  external?: number;
  productivity?: number;
  confidence?: number;
  regions?: string[];
}

export const ECON_SHOCKS: EconShock[] = [
  { key: "seca", title: "Estiagem severa atinge lavouras e reservatórios", body: "A falta de chuvas pressiona preços de alimentos e energia. Governos estaduais decretam emergência em municípios afetados.", prob: 0.03, supply: 0.6, confidence: -3, regions: ["NE", "CO"] },
  { key: "commodities_alta", title: "Preços de commodities disparam no mercado internacional", body: "A alta favorece exportadores e melhora a balança comercial, mas preocupa quem acompanha a inflação de combustíveis.", prob: 0.04, external: 1.2, supply: 0.2, confidence: 2 },
  { key: "crise_global", title: "Turbulência financeira global derruba bolsas", body: "Investidores buscam proteção e o real se desvaloriza. Analistas revisam para baixo as projeções de crescimento.", prob: 0.025, external: -1.8, confidence: -6 },
  { key: "safra_recorde", title: "Safra recorde reduz preço dos alimentos", body: "A produção agrícola supera as estimativas e alivia a inflação de alimentos nos próximos meses.", prob: 0.04, supply: -0.5, confidence: 2, regions: ["CO", "S"] },
  { key: "greve_caminhoneiros", title: "Paralisação de caminhoneiros afeta abastecimento", body: "Bloqueios em rodovias provocam falta de combustível e alimentos em várias capitais.", prob: 0.015, supply: 0.8, confidence: -5 },
  { key: "inovacao", title: "Onda de investimentos em tecnologia e energia limpa", body: "Novos projetos industriais e de energia renovável prometem elevar a produtividade nos próximos anos.", prob: 0.02, productivity: 0.3, confidence: 3 },
  { key: "enchentes", title: "Enchentes deixam milhares de desalojados", body: "Chuvas extremas causam destruição em cidades e estradas. A reconstrução deve exigir recursos federais.", prob: 0.02, supply: 0.3, confidence: -3, regions: ["S", "SE"] },
];

/** Atualização mensal: choques, passo econômico, aprovação do governo, notícias. */
export function monthlyEconomy(ctx: Ctx): void {
  const prev = ctx.s.economy;
  const rng = ctx.rng("economy", monthKey(ctx.date));
  const shocks = { supply: rng.normal(0, 0.08), external: rng.normal(0, 0.25), productivity: rng.normal(0, 0.03), confidence: rng.normal(0, 1.5) };
  for (const shock of ECON_SHOCKS) {
    if (!rng.chance(shock.prob)) continue;
    shocks.supply += shock.supply ?? 0;
    shocks.external += shock.external ?? 0;
    shocks.productivity += shock.productivity ?? 0;
    shocks.confidence += shock.confidence ?? 0;
    const ev = ctx.emit("ECON_SHOCK", { payload: { key: shock.key } });
    ctx.publish("ECON_SHOCK", { facts: { title: shock.title, body: shock.body }, eventId: ev.id });
    if (shock.regions) {
      for (const seg of ctx.t.voter_segments.values()) {
        const ufRegion = ufRegionCache(seg.uf);
        if (shock.regions.includes(ufRegion)) {
          seg.mood = Math.max(-1, seg.mood - 0.1);
          ctx.save("voter_segments", seg);
        }
      }
    }
  }
  // Políticas concluídas e votações somam impulso
  const policyImpulse = [...ctx.t.policies.values()]
    .filter((p) => p.status === "EM_ANDAMENTO" && p.office_code === "PRESIDENTE")
    .reduce((s, p) => s + (p.effects.fiscal ?? 0), 0);
  const next = stepEconomy(prev, { fiscalStance: ctx.world.gov.fiscal_stance + policyImpulse, shocks }, monthKey(ctx.date), ctx.world.id);
  ctx.saveEconomy(next);
  applyMonthlyInflation(ctx, next.inflation_month);

  // Aprovação do governo federal acompanha economia (com inércia)
  const econScore = 50 + (next.gdp_growth - 2) * 4 - (next.inflation_12m - 4) * 3 - (next.unemployment - 7) * 2.5 + (next.confidence - 50) * 0.2;
  const approval = Math.max(10, Math.min(85, ctx.world.gov.approval * 0.8 + econScore * 0.2 + rng.normal(0, 1)));
  ctx.world.gov.approval = Math.round(approval * 10) / 10;
  ctx.saveWorld();

  // Humor dos segmentos
  const mood = Math.max(-1, Math.min(1, (approval - 50) / 40));
  for (const seg of ctx.t.voter_segments.values()) {
    seg.mood = Math.round((seg.mood * 0.8 + mood * 0.2) * 1000) / 1000;
    ctx.save("voter_segments", seg);
  }

  const fmt = (v: number) => v.toFixed(1).replace(".", ",");
  ctx.publish("ECON_MONTHLY", {
    facts: {
      month: monthLabel(monthKey(addMonths(ctx.date, -1))),
      inflation: fmt(next.inflation_12m),
      unemployment: fmt(next.unemployment),
      growth: fmt(next.gdp_growth),
      debt: fmt(next.debt_gdp),
      confidence: fmt(next.confidence),
      selic: fmt(next.selic),
    },
  });
  if (month(ctx.date) % 3 === 0) {
    ctx.publish("GOV_APPROVAL", { facts: { approval: Math.round(approval), institute: rng.pick(["Instituto Pulso Cívico", "DataPainel", "Mira Pesquisas"]) } });
  }
}

export function copomMeeting(ctx: Ctx): void {
  const e = ctx.s.economy;
  const delta = copomDecision(e);
  const selic = Math.max(2, Math.round((e.selic + delta) * 100) / 100);
  ctx.saveEconomy({ ...e, selic });
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  const ev = ctx.emit("COPOM", { payload: { from: e.selic, to: selic } });
  ctx.publish("COPOM_DECISION", {
    eventId: ev.id,
    facts: {
      verb: delta > 0 ? "eleva" : delta < 0 ? "reduz" : "mantém",
      prep: delta === 0 ? "em" : "para",
      decision: delta === 0 ? "manter a taxa básica inalterada" : `${delta > 0 ? "elevar" : "reduzir"} a taxa básica em ${fmt(Math.abs(delta))} ponto percentual`,
      selic: fmt(selic),
      inflation: fmt(e.inflation_12m),
      expectations: fmt(e.expectations),
    },
  });
}

const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function monthLabel(key: string): string {
  return `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} de ${key.slice(0, 4)}`;
}

function ufRegionCache(uf: string): string {
  return UF_BY_CODE[uf]?.region ?? "SE";
}
