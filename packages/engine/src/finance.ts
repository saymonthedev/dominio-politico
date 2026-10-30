import { addMonths, monthKey } from "./calendar";
import { profession } from "./names";
import type { OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { FinanceKind, LedgerItem, PartyRow, PersonRow, PersonStateRow, WorldRow } from "./types";

/**
 * Dinheiro no jogo. Valores de referência aproximados (não são parecer
 * contábil): subsídios por cargo e época, Imposto de Renda simplificado,
 * custo de vida, rendimento da poupança pela Selic, juros de dívida,
 * contribuição ao partido e fundo partidário com cláusula de desempenho.
 *
 * Todo mês fecha um extrato por categoria (finance_transactions + ledger).
 */

/** Nível de preços histórico relativo a 2026 (IPCA acumulado aproximado; depois de 2026, 4% ao ano como referência). */
const PRICE_POINTS: Array<[number, number]> = [
  [2002, 0.3],
  [2006, 0.38],
  [2010, 0.45],
  [2014, 0.56],
  [2018, 0.7],
  [2022, 0.86],
  [2026, 1],
];

export function priceLevel(date: string): number {
  const y = Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) - 1) / 12;
  if (y >= 2026) return Math.round(Math.pow(1.04, y - 2026) * 1000) / 1000;
  if (y <= 2002) return 0.3;
  for (let i = 1; i < PRICE_POINTS.length; i++) {
    const [y1, v1] = PRICE_POINTS[i - 1];
    const [y2, v2] = PRICE_POINTS[i];
    if (y <= y2) return Math.round((v1 + ((v2 - v1) * (y - y1)) / (y2 - y1)) * 1000) / 1000;
  }
  return 1;
}

/** Subsídio de deputados federais e senadores (R$ nominais, aproximados). */
const FEDERAL_LEGISLATOR: Array<[string, number]> = [
  ["1995-01-01", 8_000],
  ["2003-02-01", 12_720],
  ["2007-04-01", 16_512.09],
  ["2011-02-01", 26_723.13],
  ["2015-02-01", 33_763],
  ["2023-04-01", 39_293.32],
  ["2024-02-01", 41_650.92],
  ["2025-02-01", 46_366.19],
];

/** Subsídio do presidente da República (R$ nominais, aproximados). */
const PRESIDENT: Array<[string, number]> = [
  ["1995-01-01", 8_500],
  ["2003-01-01", 8_885.48],
  ["2007-04-01", 11_420.21],
  ["2011-01-01", 26_723.13],
  ["2015-01-01", 30_934.7],
  ["2023-04-01", 39_293.32],
  ["2024-02-01", 41_650.92],
  ["2025-02-01", 46_366.19],
];

export type PricedWorld = Pick<WorldRow, "game_date" | "stats">;

/**
 * Nível de preços do mundo (2026 = 1). Até o ponto de partida vale a tabela
 * histórica; depois, o IPCA simulado acumulado mês a mês (world.stats.price_level).
 */
export function worldPriceLevel(world: PricedWorld): number {
  return world.stats?.price_level ?? priceLevel(world.game_date);
}

/** Nível de preços numa data: no dia corrente do mundo, o simulado; em outras datas, a tabela histórica. */
export function priceLevelAt(ctx: Ctx, date = ctx.date): number {
  return date === ctx.date ? worldPriceLevel(ctx.world) : priceLevel(date);
}

/** Corrige o nível de preços pela inflação do mês (fechamento da economia, no dia 1). */
export function applyMonthlyInflation(ctx: Ctx, inflationMonthPct: number): void {
  // mundos criados antes deste campo partem da tabela no início do mês que fechou
  const base = ctx.world.stats?.price_level ?? priceLevel(addMonths(ctx.date, -1));
  const level = base * (1 + inflationMonthPct / 100);
  ctx.world.stats = { ...ctx.world.stats, price_level: Math.round(level * 10_000) / 10_000 };
}

function stepValue(table: Array<[string, number]>, date: string, level: number): number {
  let v = table[0][1];
  for (const [d, val] of table) if (date >= d) v = val;
  // depois da última referência, reajuste pela inflação a partir de 2026
  const last = table[table.length - 1];
  if (date >= "2027-01-01") v = last[1] * (level / priceLevel("2026-06-01"));
  return v;
}

function populationOf(ctx: Ctx, geo: string | null): number {
  const city = geo ? ctx.s.cities?.get(geo) : undefined;
  return city ? city.electorate * 1.35 : 60_000;
}

/** Subsídio mensal bruto do cargo (CF arts. 27, 29 e 49; valores de referência). */
export function subsidyFor(ctx: Ctx, office: OfficeCode, geo: string | null, date = ctx.date): number {
  const level = priceLevelAt(ctx, date);
  const fed = stepValue(FEDERAL_LEGISLATOR, date, level);
  switch (office) {
    case "DEP_FEDERAL":
    case "SENADOR":
      return fed;
    case "PRESIDENTE":
      return stepValue(PRESIDENT, date, level);
    case "GOVERNADOR":
    case "DEP_ESTADUAL":
      return fed * 0.75;
    case "PREFEITO": {
      const pop = populationOf(ctx, geo);
      const city = geo ? ctx.s.cities?.get(geo) : undefined;
      const share = city?.capital ? 0.62 : pop > 500_000 ? 0.5 : pop > 100_000 ? 0.4 : pop > 20_000 ? 0.3 : 0.22;
      return fed * share;
    }
    case "VEREADOR": {
      // art. 29, VI: de 20% a 75% do subsídio do deputado estadual, conforme a população
      const pop = populationOf(ctx, geo);
      const share = pop <= 10_000 ? 0.2 : pop <= 50_000 ? 0.3 : pop <= 100_000 ? 0.4 : pop <= 300_000 ? 0.5 : pop <= 500_000 ? 0.6 : 0.75;
      return fed * 0.75 * share;
    }
  }
}

type Bracket = [limit: number, rate: number, deduction: number];

function irTable(year: number): Bracket[] {
  if (year < 2009) return [[1_372.81, 0, 0], [2_743.25, 0.15, 205.92], [Infinity, 0.275, 548.82]];
  if (year < 2015) return [[1_637.11, 0, 0], [2_453.5, 0.075, 122.78], [3_271.38, 0.15, 306.8], [4_087.65, 0.225, 552.15], [Infinity, 0.275, 756.53]];
  if (year < 2023) return [[1_903.98, 0, 0], [2_826.65, 0.075, 142.8], [3_751.05, 0.15, 354.8], [4_664.68, 0.225, 636.13], [Infinity, 0.275, 869.36]];
  return [[2_259.2, 0, 0], [2_826.65, 0.075, 169.44], [3_751.05, 0.15, 381.44], [4_664.68, 0.225, 662.77], [Infinity, 0.275, 896]];
}

/** Imposto de Renda mensal estimado (tabela progressiva, sem deduções; isenção até R$ 5 mil a partir de 2026). */
export function incomeTax(gross: number, date: string): number {
  if (gross <= 0) return 0;
  const year = Number(date.slice(0, 4));
  const [limit, rate, ded] = irTable(year).find(([l]) => gross <= l)!;
  void limit;
  let tax = Math.max(0, gross * rate - ded);
  if (year >= 2026) {
    if (gross <= 5_000) tax = 0;
    else if (gross <= 7_350) tax = Math.max(0, tax - (978.62 - 0.133145 * gross));
  }
  return Math.round(tax * 100) / 100;
}

/** Contribuição estatutária de quem tem mandato (legendas mais à esquerda cobram mais; estimativa do jogo). */
export function partyContributionRate(party: PartyRow): number {
  return Math.round((0.04 + Math.max(0, -party.ideology.economy) / 100 * 0.1) * 1000) / 1000;
}

export function professionIncome(p: PersonRow, level: number): number {
  return profession(p.profession.split("|")[0]).income * level;
}

/** Custo de vida mensal: moradia, família, deslocamentos (mais alto para quem tem mandato). */
export function livingCost(ctx: Ctx, p: PersonRow, subsidy: number, date = ctx.date): number {
  const level = priceLevelAt(ctx, date);
  const base = Math.max(1_800 * level, professionIncome(p, level) * 0.5);
  return Math.round(base + (p.office_code ? subsidy * 0.25 : 0));
}

export interface MonthlyPreview {
  items: LedgerItem[];
  net: number;
  interest: number;
}

/** Fechamento do mês para um jogador: o que entra, o que sai e os juros da dívida. */
export function monthlyStatement(ctx: Ctx, p: PersonRow, st: PersonStateRow, date = ctx.date): MonthlyPreview {
  const items: LedgerItem[] = [];
  const jailed = !!st.jailed_until && st.jailed_until > date;
  const subsidy = p.office_code && !jailed ? subsidyFor(ctx, p.office_code, p.office_geo, date) : 0;
  // durante o mandato, a atividade profissional fica em segundo plano
  // jornada de trabalho combinada nos acontecimentos da carreira (licença, meio período, demissão)
  const share = typeof st.story?.flags.jornada === "number" ? Math.max(0, Math.min(1, st.story.flags.jornada)) : 1;
  const work = jailed ? 0 : professionIncome(p, priceLevelAt(ctx, date)) * (p.office_code ? 0.15 : 1) * share;
  if (work > 0) items.push({ kind: "RENDA", label: p.office_code ? "Rendimentos da atividade privada" : share < 1 ? "Salário (jornada reduzida)" : "Salário e rendimentos da profissão", amount: Math.round(work) });
  if (subsidy > 0) items.push({ kind: "SUBSIDIO", label: `Subsídio de ${p.office_code === "PRESIDENTE" ? "presidente" : "parlamentar ou chefe do Executivo"}`, amount: Math.round(subsidy) });
  const tax = incomeTax(work + subsidy, date);
  if (tax > 0) items.push({ kind: "IMPOSTO", label: "Imposto de Renda retido (estimativa)", amount: -Math.round(tax) });
  const selic = ctx.s.economy?.selic ?? 10;
  if (st.money > 0) {
    const gross = st.money * (selic * 0.95 / 100 / 12);
    items.push({ kind: "RENDIMENTO", label: `Rendimento da reserva (${selic.toFixed(2).replace(".", ",")}% de Selic, já com IR)`, amount: Math.round(gross * 0.85) });
  }
  items.push({ kind: "CUSTO_VIDA", label: "Custo de vida", amount: -livingCost(ctx, p, subsidy, date) });
  const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  if (party && subsidy > 0) {
    const rate = partyContributionRate(party);
    items.push({ kind: "CONTRIBUICAO_PARTIDO", label: `Contribuição estatutária ao ${party.acronym} (${Math.round(rate * 100)}%)`, amount: -Math.round(subsidy * rate) });
  }
  const interest = st.debt > 0 ? Math.round(st.debt * (selic / 100 / 12 + 0.025)) : 0;
  const net = items.reduce((s, i) => s + i.amount, 0);
  return { items, net, interest };
}

/** Executa o fechamento mensal de todos os jogadores (dia 1). */
export function monthlyFinances(ctx: Ctx): void {
  const prev = monthKey(addMonths(ctx.date, -1));
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    const { items, net, interest } = monthlyStatement(ctx, p, st);
    st.money += net;
    if (interest > 0) {
      st.debt += interest;
      items.push({ kind: "JUROS", label: "Juros da dívida (somados ao saldo devedor)", amount: -interest });
    }
    if (st.money < 0) {
      st.debt += -st.money;
      items.push({ kind: "EMPRESTIMO", label: "Empréstimo automático para cobrir o saldo negativo", amount: -st.money });
      ctx.notify(p.id, "Você entrou no vermelho", `O mês fechou negativo e o banco cobriu a diferença. Dívida atual: R$ ${Math.round(st.debt).toLocaleString("pt-BR")}, com juros todo mês.`, "/jogo/financas");
      st.money = 0;
    }
    const gross = items.filter((i) => i.kind === "RENDA" || i.kind === "SUBSIDIO").reduce((s, i) => s + i.amount, 0);
    if (ctx.date.slice(5, 7) === "01") st.income_last_year = 0;
    st.income_last_year += gross;
    st.ledger = { month: prev, items, net: items.filter((i) => i.kind !== "EMPRESTIMO" && i.kind !== "JUROS").reduce((s, i) => s + i.amount, 0) };
    for (const item of items) {
      if (!item.amount) continue;
      ctx.insert("finance_transactions", {
        id: ctx.id("fin", p.id, item.kind),
        world_id: ctx.world.id,
        person_id: p.id,
        candidacy_id: null,
        kind: item.kind as FinanceKind,
        amount: item.amount,
        declared: true,
        game_date: ctx.date,
        description: item.label,
      });
    }
    st.political_capital = Math.min(100, st.political_capital + (p.office_code ? 3 : 0.5));
    ctx.save("person_states", st);
  }
}

/** Cláusula de desempenho (EC 97/2017): deputados federais exigidos para o fundo partidário. */
export function performanceClause(date: string): number {
  const y = Number(date.slice(0, 4));
  if (y < 2019) return 0;
  if (y < 2023) return 9;
  if (y < 2027) return 11;
  if (y < 2031) return 13;
  return 15;
}

/** Fundo partidário mensal (5% igualitário entre as legendas que cumprem a cláusula, 95% pela bancada) e custeio. */
export function monthlyPartyFinances(ctx: Ctx): void {
  const parties = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO");
  const clause = performanceClause(ctx.date);
  const eligible = parties.filter((p) => (p.seats.camara ?? 0) >= clause && !(p.fund_suspended_until && p.fund_suspended_until > ctx.date));
  const pl = worldPriceLevel(ctx.world);
  const totalMonthly = (1_300_000_000 / 12) * pl;
  const seatsTotal = eligible.reduce((s, p) => s + (p.seats.camara ?? 0), 0) || 1;
  for (const party of parties) {
    const isEligible = eligible.includes(party);
    const fund = isEligible ? totalMonthly * (0.05 / Math.max(1, eligible.length) + 0.95 * (party.seats.camara ?? 0) / seatsTotal) : 0;
    // a maior parte do fundo vai para diretórios, pessoal, propaganda e institutos
    const upkeep = fund * 0.9 + party.cash * 0.01 + 15_000 * pl * Math.max(1, Object.values(party.territory).filter((v) => v > 0.05).length / 5);
    const dues = party.members * 0.5 * pl;
    const next = Math.max(0, Math.round(party.cash + fund + dues - upkeep));
    if (next !== Math.round(party.cash)) {
      party.cash = next;
      ctx.save("parties", party);
    }
  }
}
