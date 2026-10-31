import { ageAt, diffDays, type ISODate } from "./calendar";
import { priceLevelAt, worldPriceLevel } from "./finance";
import { canonicalGeo, capitalId, isMunicipality } from "./geo";
import { profession } from "./names";
import { rngFor, type Rng } from "./rng";
import type { Ctx, WorldState } from "./state";
import { storyOf } from "./story/state";
import type { Car, CarModel, Home, HomeKind, Loan, StoryState } from "./story/types";
import type { FinanceKind, LedgerItem, PersonRow, PersonStateRow } from "./types";

/**
 * Moradia e carro. Os bairros (ou, onde não há bairros oficiais, os distritos) são os
 * do Censo 2022, com população e renda média de quem chefia o domicílio. O preço do
 * metro quadrado é uma estimativa do jogo: cresce com a renda e o tamanho da cidade
 * (calibrado em médias de mercado das capitais: ~R$ 12 mil no Centro de Florianópolis,
 * ~R$ 18 mil em Pinheiros, ~R$ 4,5 mil numa cidade média do interior) e varia por bairro
 * conforme a renda de quem mora ali.
 *
 * Quem mora com a família ajuda nas contas; quem aluga paga aluguel reajustado todo
 * ano; quem é dono paga IPTU e manutenção (e a prestação, se financiou). Sem casa, a
 * saúde e a imagem sofrem. Valores em reais do dia (nível de preços do mundo).
 */

export interface BairroInfo {
  name: string;
  pop: number;
  /** renda média mensal de quem chefia o domicílio (R$ de 2022) */
  income: number;
}

export interface CityHousing {
  /** renda média da cidade (R$ de 2022) */
  income: number;
  /** domicílios (pessoas responsáveis) */
  households: number;
  /** "b" = bairros oficiais; "d" = distritos */
  kind: "b" | "d";
  bairros: BairroInfo[];
}

/** Arquivo gerado por scripts/build-bairros.mjs: { m: { [ibge]: { r, n, t, b: [nome, pop, renda][] } } } */
export interface BairrosFile {
  fonte?: string;
  m: Record<string, { r: number; n: number; t: "b" | "d"; b: Array<[string, number, number]> }>;
}

export function housingFromFile(file: BairrosFile): Map<string, CityHousing> {
  const out = new Map<string, CityHousing>();
  for (const [id, c] of Object.entries(file.m)) {
    out.set(id, { income: c.r, households: c.n, kind: c.t, bairros: c.b.map(([name, pop, income]) => ({ name, pop, income })) });
  }
  return out;
}

/** Sem os dados (testes, mundos antigos): uma cidade genérica com três bairros. */
const FALLBACK: CityHousing = {
  income: 3200,
  households: 60_000,
  kind: "b",
  bairros: [
    { name: "Centro", pop: 18_000, income: 4200 },
    { name: "Jardim das Flores", pop: 14_000, income: 5600 },
    { name: "Vila Nova", pop: 26_000, income: 2100 },
  ],
};

export function cityHousing(s: Pick<WorldState, "housing">, cityId: string): CityHousing {
  const ch = s.housing?.get(cityId);
  return ch && ch.bairros.length ? ch : FALLBACK;
}

/** Cidade onde o personagem mora (a cidade-base; sem ela, a capital do estado). */
export function homeCityOf(p: PersonRow): string {
  const g = canonicalGeo(p.municipality);
  return isMunicipality(g) ? g : capitalId(p.uf);
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Preços
// ---------------------------------------------------------------------------

export const HOME_TIERS = [
  { tier: 0, label: "quitinete ou quarto", size: 25, m2: 0.72, yield: 0.0056 },
  { tier: 1, label: "imóvel simples", size: 45, m2: 0.85, yield: 0.005 },
  { tier: 2, label: "imóvel de médio padrão", size: 70, m2: 1, yield: 0.0046 },
  { tier: 3, label: "imóvel de alto padrão", size: 120, m2: 1.25, yield: 0.0042 },
  { tier: 4, label: "casa de luxo", size: 240, m2: 1.6, yield: 0.0036 },
] as const;

export const tierLabel = (tier: number) => HOME_TIERS[clamp(Math.round(tier), 0, 4)].label;

/**
 * Metro quadrado (R$ de 2026) estimado pela renda média e pelo tamanho da cidade:
 * ~R$ 12 mil em São Paulo, ~R$ 7 mil em Fortaleza, ~R$ 5 mil numa cidade média do Sul,
 * ~R$ 3 mil numa cidade pequena de renda baixa.
 */
export function cityM2(ch: CityHousing): number {
  if (!ch.income) return 3000;
  // 0,85: o bairro de renda média vale menos que a média dos anúncios (que se concentram nos bairros ricos)
  return Math.max(1800, 0.85 * 6.82 * Math.pow(ch.income, 0.7) * Math.pow(Math.max(500, ch.households), 0.1));
}

/** Bairro mais rico, metro quadrado mais caro (e o contrário), sem extremos absurdos. */
export function bairroFactor(ch: CityHousing, b: BairroInfo): number {
  if (!ch.income || !b.income) return 1;
  return clamp(Math.pow(b.income / ch.income, 0.55), 0.5, 2.3);
}

export function findBairro(ch: CityHousing, name: string): BairroInfo | undefined {
  return ch.bairros.find((b) => b.name === name);
}

export interface Quote {
  bairro: string;
  tier: number;
  size: number;
  /** preço de compra (R$ do dia) */
  price: number;
  /** aluguel mensal (R$ do dia) */
  rent: number;
  /** IPTU, condomínio e manutenção por mês, para quem é dono */
  upkeep: number;
  m2: number;
}

/** Preço de um imóvel de certo padrão num bairro, em reais do dia. */
export function quote(s: Pick<WorldState, "housing" | "world">, cityId: string, bairro: string, tier: number): Quote {
  const ch = cityHousing(s, cityId);
  const b = findBairro(ch, bairro) ?? ch.bairros[0];
  const t = HOME_TIERS[clamp(Math.round(tier), 0, 4)];
  const level = worldPriceLevel(s.world);
  const m2 = cityM2(ch) * bairroFactor(ch, b) * t.m2 * level;
  const price = roundMoney(m2 * t.size);
  return { bairro: b.name, tier: t.tier, size: t.size, price, rent: roundMoney(price * t.yield, 10), upkeep: roundMoney(price * (t.tier >= 3 ? 0.0013 : 0.0011), 10), m2: Math.round(m2) };
}

function roundMoney(v: number, to = 1000): number {
  return Math.max(to, Math.round(v / to) * to);
}

/** Bairros da cidade com o preço do m² de médio padrão, do mais caro para o mais barato. */
export function housingMarket(s: Pick<WorldState, "housing" | "world">, cityId: string): Array<{ name: string; pop: number; income: number; m2: number; quotes: Quote[] }> {
  const ch = cityHousing(s, cityId);
  return ch.bairros
    .map((b) => {
      const quotes = HOME_TIERS.map((t) => quote(s, cityId, b.name, t.tier));
      return { name: b.name, pop: b.pop, income: b.income, m2: quotes[2].m2, quotes };
    })
    .sort((a, b) => b.m2 - a.m2 || a.name.localeCompare(b.name, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Carros
// ---------------------------------------------------------------------------

export const CARS: Record<CarModel, { label: string; price: number; upkeep: number; ipva: number; insurance: number; tier: number }> = {
  moto: { label: "moto 160 cc", price: 18_000, upkeep: 220, ipva: 0.02, insurance: 0.06, tier: 1 },
  popular_usado: { label: "carro popular usado", price: 38_000, upkeep: 450, ipva: 0.03, insurance: 0.045, tier: 1 },
  popular_novo: { label: "carro popular 0 km", price: 82_000, upkeep: 600, ipva: 0.035, insurance: 0.04, tier: 2 },
  medio: { label: "sedã ou SUV médio", price: 160_000, upkeep: 950, ipva: 0.035, insurance: 0.04, tier: 3 },
  luxo: { label: "SUV importado de luxo", price: 450_000, upkeep: 2_600, ipva: 0.04, insurance: 0.045, tier: 4 },
};

export const CAR_MODELS = Object.keys(CARS) as CarModel[];

export function carPrice(s: Pick<WorldState, "world">, model: CarModel): number {
  return roundMoney(CARS[model].price * worldPriceLevel(s.world), 500);
}

/** Valor de mercado do carro: corrigido pela inflação e depreciado ~12% ao ano (o 0 km perde 15% ao sair da loja). */
export function carValue(s: Pick<WorldState, "world">, car: Car, date: ISODate): number {
  const years = Math.max(0, diffDays(date, car.since) / 365);
  const level = worldPriceLevel(s.world) / (car.level || 1);
  const first = car.model === "popular_novo" || car.model === "medio" || car.model === "luxo" ? 0.85 : 0.95;
  return Math.round(car.value * level * first * Math.pow(0.88, years));
}

/** Valor de mercado da casa própria (acompanha a inflação). */
export function homeValue(s: Pick<WorldState, "world">, home: Home): number {
  if (home.kind !== "PROPRIA") return 0;
  return Math.round(home.value * (worldPriceLevel(s.world) / (home.level || 1)));
}

// ---------------------------------------------------------------------------
// Financiamento (tabela Price)
// ---------------------------------------------------------------------------

export function installmentOf(principal: number, rate: number, months: number): number {
  if (months <= 0) return principal;
  if (rate <= 0) return principal / months;
  return (principal * rate) / (1 - Math.pow(1 + rate, -months));
}

export function makeLoan(principal: number, yearlyRate: number, months: number): Loan {
  const rate = Math.pow(1 + yearlyRate, 1 / 12) - 1;
  return { balance: Math.round(principal), installment: Math.round(installmentOf(principal, rate, months)), months, rate: Math.round(rate * 1e6) / 1e6 };
}

/** Paga uma prestação: juros do mês e o resto abate o saldo. */
export function amortize(loan: Loan): Loan | null {
  const interest = loan.balance * loan.rate;
  const balance = Math.max(0, loan.balance + interest - loan.installment);
  const months = loan.months - 1;
  if (months <= 0 || balance < 1) return null;
  return { ...loan, balance: Math.round(balance), months };
}

/** Juros do financiamento imobiliário (~10,5% ao ano) e do carro (~22% ao ano). */
export const MORTGAGE_RATE = 0.105;
export const CAR_LOAN_RATE = 0.22;

/** Renda mensal que o banco considera: subsídio do cargo ou salário da profissão. */
export function monthlyIncome(ctx: Ctx, p: PersonRow, st: PersonStateRow, subsidy: number): number {
  if (p.office_code) return subsidy;
  const share = typeof st.story?.flags.jornada === "number" ? st.story.flags.jornada : 1;
  return profession(p.profession.split("|")[0]).income * priceLevelAt(ctx) * share;
}

// ---------------------------------------------------------------------------
// Moradia inicial
// ---------------------------------------------------------------------------

/** Escolhe um bairro coerente com o padrão (os mais pobres para o simples, os mais ricos para o luxo). */
function pickBairro(ch: CityHousing, tier: number, rng: Rng): string {
  const sorted = [...ch.bairros].sort((a, b) => a.income - b.income);
  const total = sorted.reduce((s, b) => s + b.pop, 0) || 1;
  const band = [
    [0, 0.45],
    [0, 0.5],
    [0.3, 0.78],
    [0.62, 0.95],
    [0.86, 1],
  ][clamp(tier, 0, 4)];
  let acc = 0;
  const pool: BairroInfo[] = [];
  for (const b of sorted) {
    const mid = (acc + b.pop / 2) / total;
    acc += b.pop;
    if (mid >= band[0] && mid <= band[1]) pool.push(b);
  }
  const list = pool.length ? pool : tier >= 3 ? sorted.slice(-1) : sorted.slice(0, 1);
  return rng.weighted(list, (b) => Math.sqrt(b.pop) + 1).name;
}

const ORIGIN_OTHER: Record<string, number> = { periferia: 3_000, classe_media: 15_000, interior: 30_000, rural: 120_000, elite: 300_000 };

export interface InitialHousing {
  home: Home;
  car: Car | null;
  other: number;
  familyBairro: string;
}

/**
 * Onde o personagem mora ao começar: aos 18 ainda com a família; no começo dos 20,
 * de aluguel; com renda e idade, casa própria (financiada ou quitada). A origem pesa:
 * família de elite dá casa melhor, periferia começa mais embaixo.
 */
export function initialHousing(s: Pick<WorldState, "housing" | "world">, p: PersonRow, date: ISODate, existing?: { assets: number }): InitialHousing {
  const rng = rngFor(s.world.seed, "moradia", 0, p.id);
  const city = homeCityOf(p);
  const ch = cityHousing(s, city);
  const age = ageAt(p.birth_year, date);
  const prof = p.profession.split("|")[0];
  const income = profession(prof).income; // R$ de 2026
  const origin = p.origin || "classe_media";
  const elite = origin === "elite";
  const poor = origin === "periferia";
  const level = worldPriceLevel(s.world);
  const familyTier = elite ? 4 : origin === "classe_media" ? 2 : poor || origin === "rural" ? 1 : 2;
  const familyBairro = pickBairro(ch, familyTier, rng);

  const byIncome = income < 3_000 ? 0 : income < 7_500 ? 1 : income < 15_000 ? 2 : 3;
  let kind: HomeKind;
  let tier: number;
  let paid = 1; // fração já paga, para casa própria
  if (age <= 20 || (age <= 23 && prof === "estudante")) {
    kind = "FAMILIA";
    tier = familyTier;
  } else if (age <= 25) {
    kind = elite ? "PROPRIA" : "ALUGUEL";
    tier = elite ? 3 : byIncome;
  } else if (age <= 32) {
    kind = elite || income >= 6_000 ? "PROPRIA" : "ALUGUEL";
    tier = elite ? 3 : kind === "PROPRIA" ? Math.max(1, Math.min(3, byIncome)) : byIncome;
    paid = elite ? 1 : clamp(0.2 + (age - 27) / 30, 0.2, 0.45);
  } else if (age <= 50) {
    kind = income >= 3_000 || !poor ? "PROPRIA" : "ALUGUEL";
    tier = clamp(byIncome + (elite ? 1 : 0) - (poor ? 1 : 0), 1, 4);
    paid = elite ? 1 : clamp(0.2 + (age - 30) / 25, 0.2, 1);
  } else {
    kind = "PROPRIA";
    tier = clamp(byIncome + (elite ? 1 : 0) - (poor ? 1 : 0), 1, 4);
  }

  let car: CarModel | null = null;
  if (age >= 18) {
    if (elite) car = age >= 30 ? "luxo" : "medio";
    else if (income >= 15_000) car = "medio";
    else if (income >= 8_000) car = "popular_novo";
    else if (income >= 3_500) car = "popular_usado";
    else if (income >= 2_000) car = "moto";
    if (age <= 20 && !elite && car) car = income >= 2_000 ? "moto" : null;
  }

  const bairro = kind === "FAMILIA" ? familyBairro : pickBairro(ch, tier, rng);
  const q = quote(s, city, bairro, tier);
  let home: Home = { kind, city, bairro, tier, size: q.size, value: kind === "PROPRIA" ? q.price : 0, level, rent: kind === "ALUGUEL" ? q.rent : 0, since: date, loan: null };
  const carRow: Car | null = car ? { model: car, value: Math.round(carPrice(s, car) * (rng.range(0.55, 0.9))), level, since: date, loan: null } : null;
  let other = Math.round((ORIGIN_OTHER[origin] ?? 15_000) * level);

  if (existing) {
    // personagem que já existia: os bens declarados viram casa + carro + outros, sem mudar o patrimônio
    let budget = existing.assets;
    const carVal = carRow ? carValue(s, carRow, date) : 0;
    const useCar = carRow && budget >= carVal ? carRow : null;
    if (useCar) budget -= carVal;
    if (home.kind === "PROPRIA") {
      let t = home.tier;
      while (t > 0 && quote(s, city, home.bairro, t).price > budget) t--;
      const q2 = quote(s, city, home.bairro, t);
      if (q2.price <= budget) {
        home = { ...home, tier: t, size: q2.size, value: q2.price };
        budget -= q2.price;
      } else {
        const r = quote(s, city, home.bairro, Math.min(home.tier, byIncome));
        home = { ...home, kind: "ALUGUEL", tier: r.tier, size: r.size, value: 0, rent: r.rent };
      }
    }
    return { home, car: useCar, other: Math.max(0, Math.round(budget)), familyBairro };
  }

  if (home.kind === "PROPRIA" && paid < 1) {
    const months = Math.round((1 - paid) * 360);
    const principal = home.value * 0.8 * (1 - paid) / 0.8;
    home = { ...home, loan: makeLoan(Math.min(home.value * 0.8, principal), MORTGAGE_RATE, Math.max(12, months)) };
  }
  if (home.kind === "FAMILIA") other = Math.round(other * 0.5);
  return { home, car: carRow, other, familyBairro };
}

/** Garante moradia, carro e outros bens no estado do jogador (personagens antigos recebem os seus a partir dos bens declarados). */
export function ensureHousing(s: Pick<WorldState, "housing" | "world">, p: PersonRow, st: PersonStateRow, date: ISODate): StoryState {
  const story = storyOf(st, p, date);
  if (story.home) return story;
  const created = !st.action_seq && !story.log.length;
  const init = initialHousing(s, p, date, created ? undefined : { assets: st.assets });
  story.home = init.home;
  story.car = init.car;
  story.other_assets = init.other;
  story.family_bairro = init.familyBairro;
  syncAssets(s, st, date);
  return story;
}

/** Bens declarados = casa própria + carro + outros (recalculado a cada mudança e no fechamento do mês). */
export function syncAssets(s: Pick<WorldState, "world">, st: PersonStateRow, date: ISODate): void {
  const story = st.story;
  if (!story?.home) return;
  story.other_assets ??= 0;
  st.assets = Math.round(story.other_assets + homeValue(s, story.home) + (story.car ? carValue(s, story.car, date) : 0));
}

/** Soma ao "outros bens" (ex.: dinheiro lavado em imóveis) sem perder na próxima conta. */
export function addOtherAssets(st: PersonStateRow, v: number): void {
  st.assets += v;
  if (st.story?.home) st.story.other_assets = Math.max(0, (st.story.other_assets ?? 0) + v);
}

/** Dívidas de financiamento (casa e carro). */
export function loansOf(st: PersonStateRow): number {
  return (st.story?.home?.loan?.balance ?? 0) + (st.story?.car?.loan?.balance ?? 0);
}

/** Patrimônio líquido: dinheiro + bens − dívida no banco − financiamentos. */
export function netWorth(st: PersonStateRow): number {
  return Math.round(st.money + st.assets - st.debt - loansOf(st));
}

// ---------------------------------------------------------------------------
// Custos do mês
// ---------------------------------------------------------------------------

/** O que a casa e o carro custam no mês (aluguel, prestações, IPTU, IPVA, seguro, combustível). */
export function housingCosts(ctx: Ctx, p: PersonRow, st: PersonStateRow, income: number): LedgerItem[] {
  const story = st.story;
  const home = story?.home;
  if (!home) return [];
  const level = priceLevelAt(ctx);
  const items: LedgerItem[] = [];
  switch (home.kind) {
    case "FAMILIA":
      items.push({ kind: "MORADIA", label: `Ajuda nas contas da casa da família (${home.bairro})`, amount: -Math.round(Math.max(250 * level, income * 0.08)) });
      break;
    case "ALUGUEL":
      items.push({ kind: "MORADIA", label: `Aluguel: ${tierLabel(home.tier)} no ${home.bairro}`, amount: -home.rent });
      if (home.tier >= 2) items.push({ kind: "MORADIA", label: "Condomínio e contas da casa", amount: -Math.round(home.rent * 0.18) });
      break;
    case "PROPRIA": {
      const value = homeValue(ctx.s, home);
      items.push({ kind: "MORADIA", label: `IPTU, condomínio e manutenção (${home.bairro})`, amount: -Math.round(value * (home.tier >= 3 ? 0.0013 : 0.0011)) });
      if (home.loan) items.push({ kind: "MORADIA", label: `Prestação do financiamento da casa (faltam ${home.loan.months})`, amount: -home.loan.installment });
      break;
    }
    case "RUA":
      break;
  }
  const car = story?.car;
  if (car) {
    const def = CARS[car.model];
    const value = carValue(ctx.s, car, ctx.date);
    const fixed = Math.round((value * (def.ipva + def.insurance)) / 12);
    items.push({ kind: "VEICULO", label: `${def.label.charAt(0).toUpperCase()}${def.label.slice(1)}: IPVA e seguro`, amount: -fixed });
    items.push({ kind: "VEICULO", label: "Combustível e manutenção", amount: -Math.round(def.upkeep * level) });
    if (car.loan) items.push({ kind: "VEICULO", label: `Prestação do carro (faltam ${car.loan.months})`, amount: -car.loan.installment });
  }
  return items;
}

/** Depois de pagar o mês: financiamentos andam, aluguel reajusta no aniversário do contrato, bens são reavaliados. */
export function housingMonthEnd(ctx: Ctx, p: PersonRow, st: PersonStateRow): void {
  const story = st.story;
  const home = story?.home;
  if (!story || !home) return;
  if (home.loan) {
    home.loan = amortize(home.loan);
    if (!home.loan) ctx.notify(p.id, "Casa quitada!", `Você pagou a última prestação do financiamento. O imóvel no ${home.bairro} agora é todo seu.`, "/jogo/bens");
  }
  if (story.car?.loan) {
    story.car.loan = amortize(story.car.loan);
    if (!story.car.loan) ctx.notify(p.id, "Carro quitado", "A última prestação do carro foi paga.", "/jogo/bens");
  }
  if (home.kind === "ALUGUEL") {
    const months = Math.round(diffDays(ctx.date, home.since) / 30.4);
    if (months > 0 && months % 12 === 0) {
      const ipca = ctx.s.economy?.inflation_12m ?? 4.5;
      const before = home.rent;
      home.rent = Math.round(home.rent * (1 + ipca / 100));
      if (home.rent > before) ctx.notify(p.id, "Aluguel reajustado", `O contrato fez aniversário: o aluguel passou de R$ ${before.toLocaleString("pt-BR")} para R$ ${home.rent.toLocaleString("pt-BR")} (IPCA de 12 meses).`, "/jogo/bens");
    }
  }
  syncAssets(ctx.s, st, ctx.date);
}

// ---------------------------------------------------------------------------
// Mudanças, compras e vendas
// ---------------------------------------------------------------------------

export interface DealResult {
  ok: boolean;
  message: string;
}

function tx(ctx: Ctx, p: PersonRow, kind: FinanceKind, amount: number, description: string): void {
  if (!amount) return;
  ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, kind.toLowerCase()), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind, amount: Math.round(amount), declared: true, game_date: ctx.date, description });
}

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/** Custo da mudança (caminhão, ajudantes), em reais do dia. */
export function movingCost(ctx: Ctx): number {
  return roundMoney(900 * worldPriceLevel(ctx.world), 100);
}

/** Vende a casa própria (corretagem de 6%; o saldo do financiamento é quitado com o dinheiro da venda). */
function sellHome(ctx: Ctx, p: PersonRow, st: PersonStateRow, story: StoryState): number {
  const home = story.home!;
  const value = homeValue(ctx.s, home);
  const net = Math.round(value * 0.94) - (home.loan?.balance ?? 0);
  st.money += net;
  tx(ctx, p, "BENS", net, `Venda do imóvel no ${home.bairro} (já descontados corretagem${home.loan ? " e saldo do financiamento" : ""})`);
  if (st.money < 0) {
    st.debt += -st.money;
    st.money = 0;
  }
  return net;
}

export function rentHome(ctx: Ctx, p: PersonRow, st: PersonStateRow, bairro: string, tier: number): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const city = homeCityOf(p);
  const ch = cityHousing(ctx.s, city);
  if (!findBairro(ch, bairro)) return { ok: false, message: "Bairro não encontrado na sua cidade." };
  const home = story.home!;
  if (home.kind === "PROPRIA") return { ok: false, message: "Você mora em casa própria. Venda o imóvel antes de se mudar para um aluguel." };
  if (home.kind === "ALUGUEL" && home.bairro === bairro && home.tier === tier) return { ok: false, message: "Você já mora num imóvel assim nesse bairro." };
  const q = quote(ctx.s, city, bairro, tier);
  const upfront = q.rent * 3 + movingCost(ctx);
  if (st.money < upfront) return { ok: false, message: `Para alugar é preciso ${fmt(upfront)}: caução de dois aluguéis, o primeiro mês e a mudança.` };
  st.money -= upfront;
  tx(ctx, p, "MORADIA", -upfront, `Mudança e caução do aluguel (${tierLabel(tier)} no ${bairro})`);
  story.home = { kind: "ALUGUEL", city, bairro, tier: q.tier, size: q.size, value: 0, level: worldPriceLevel(ctx.world), rent: q.rent, since: ctx.date, loan: null };
  syncAssets(ctx.s, st, ctx.date);
  return { ok: true, message: `Contrato assinado: ${tierLabel(tier)} no ${bairro}, ${fmt(q.rent)} por mês. Mudança feita.` };
}

export function buyHome(ctx: Ctx, p: PersonRow, st: PersonStateRow, subsidy: number, bairro: string, tier: number, financed: boolean): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const city = homeCityOf(p);
  const ch = cityHousing(ctx.s, city);
  if (!findBairro(ch, bairro)) return { ok: false, message: "Bairro não encontrado na sua cidade." };
  if (story.home!.kind === "PROPRIA") return { ok: false, message: "Você já tem casa própria. Venda a atual antes de comprar outra." };
  const q = quote(ctx.s, city, bairro, tier);
  const fees = Math.round(q.price * 0.03) + movingCost(ctx); // ITBI, cartório e mudança
  const age = ageAt(p.birth_year, ctx.date);
  let loan: Loan | null = null;
  let upfront = q.price + fees;
  if (financed) {
    const months = Math.min(360, (80 - age) * 12);
    if (months < 60) return { ok: false, message: "Com a sua idade, o banco não financia: a última prestação passaria dos 80 anos." };
    const principal = Math.round(q.price * 0.8);
    loan = makeLoan(principal, MORTGAGE_RATE, months);
    const income = monthlyIncome(ctx, p, st, subsidy);
    if (loan.installment > income * 0.35) return { ok: false, message: `O banco recusou: a prestação (${fmt(loan.installment)}) passaria de 35% da sua renda (${fmt(income)}).` };
    upfront = q.price - principal + fees;
  }
  if (st.money < upfront) return { ok: false, message: `Faltam recursos: ${financed ? "entrada de 20%" : "o preço"} e as taxas somam ${fmt(upfront)}.` };
  st.money -= upfront;
  tx(ctx, p, "BENS", -upfront, `Compra do imóvel no ${bairro} (${financed ? "entrada, " : ""}ITBI, cartório e mudança)`);
  story.home = { kind: "PROPRIA", city, bairro, tier: q.tier, size: q.size, value: q.price, level: worldPriceLevel(ctx.world), rent: 0, since: ctx.date, loan };
  syncAssets(ctx.s, st, ctx.date);
  return { ok: true, message: `Chave na mão: ${tierLabel(tier)} no ${bairro}, ${q.size} m², por ${fmt(q.price)}${loan ? `, financiado em ${loan.months} meses de ${fmt(loan.installment)}` : " à vista"}.` };
}

export type AfterSale = "ALUGAR" | "FAMILIA" | "RUA";

export function sellHomeAndMove(ctx: Ctx, p: PersonRow, st: PersonStateRow, next: AfterSale): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const home = story.home!;
  if (home.kind !== "PROPRIA") return { ok: false, message: "Você não tem imóvel para vender." };
  const net = sellHome(ctx, p, st, story);
  const level = worldPriceLevel(ctx.world);
  const city = home.city;
  if (next === "ALUGAR") {
    const q = quote(ctx.s, city, home.bairro, Math.min(home.tier, 3));
    st.money -= q.rent * 2;
    tx(ctx, p, "MORADIA", -q.rent * 2, "Caução do aluguel");
    story.home = { kind: "ALUGUEL", city, bairro: home.bairro, tier: q.tier, size: q.size, value: 0, level, rent: q.rent, since: ctx.date, loan: null };
  } else if (next === "FAMILIA") {
    story.home = { kind: "FAMILIA", city, bairro: story.family_bairro ?? home.bairro, tier: 2, size: 0, value: 0, level, rent: 0, since: ctx.date, loan: null };
  } else {
    story.home = { kind: "RUA", city, bairro: home.bairro, tier: 0, size: 0, value: 0, level, rent: 0, since: ctx.date, loan: null };
  }
  syncAssets(ctx.s, st, ctx.date);
  const where = next === "ALUGAR" ? `e alugou no mesmo bairro (${fmt(story.home.rent)} por mês)` : next === "FAMILIA" ? "e voltou para a casa da família" : "e ficou sem ter onde morar";
  return { ok: true, message: `Imóvel vendido: ${fmt(net)} entraram na conta ${where}.` };
}

export function moveToFamily(ctx: Ctx, p: PersonRow, st: PersonStateRow): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const home = story.home!;
  if (home.kind === "FAMILIA") return { ok: false, message: "Você já mora com a família." };
  if (home.kind === "PROPRIA") return { ok: false, message: "Venda o imóvel antes (ou more nele)." };
  story.home = { kind: "FAMILIA", city: home.city, bairro: story.family_bairro ?? home.bairro, tier: 2, size: 0, value: 0, level: worldPriceLevel(ctx.world), rent: 0, since: ctx.date, loan: null };
  syncAssets(ctx.s, st, ctx.date);
  const age = ageAt(p.birth_year, ctx.date);
  return { ok: true, message: age >= 35 ? "A família abriu a porta, com um ou outro comentário sobre a idade. Sem aluguel, a conta respira." : "De volta ao quarto de sempre. Sem aluguel, sobra dinheiro." };
}

export function moveToStreet(ctx: Ctx, p: PersonRow, st: PersonStateRow): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const home = story.home!;
  if (home.kind === "RUA") return { ok: false, message: "Você já está sem casa." };
  if (home.kind === "PROPRIA") return { ok: false, message: "Você tem casa própria: venda antes, se quiser mesmo sair." };
  story.home = { kind: "RUA", city: home.city, bairro: home.bairro, tier: 0, size: 0, value: 0, level: worldPriceLevel(ctx.world), rent: 0, since: ctx.date, loan: null };
  p.reputation = Math.max(0, Math.round((p.reputation - 6) * 10) / 10);
  ctx.save("persons", p);
  return { ok: true, message: "Você entregou as chaves e foi para a rua. A conta não tem mais aluguel — mas a saúde e a imagem vão pagar." };
}

export function buyCar(ctx: Ctx, p: PersonRow, st: PersonStateRow, subsidy: number, model: CarModel, financed: boolean): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const def = CARS[model];
  if (!def) return { ok: false, message: "Modelo inválido." };
  const price = carPrice(ctx.s, model);
  // o carro atual entra na troca pelo valor de mercado (menos 10% da loja)
  const old = story.car;
  const tradeIn = old ? Math.round(carValue(ctx.s, old, ctx.date) * 0.9) - (old.loan?.balance ?? 0) : 0;
  let loan: Loan | null = null;
  let upfront = price - tradeIn;
  if (financed) {
    const principal = Math.round(price * 0.8);
    loan = makeLoan(principal, CAR_LOAN_RATE, 48);
    const income = monthlyIncome(ctx, p, st, subsidy);
    const homeInstallment = story.home?.loan?.installment ?? 0;
    if (loan.installment + homeInstallment > income * 0.4) return { ok: false, message: `O banco recusou: com a prestação do carro (${fmt(loan.installment)}) as parcelas passariam de 40% da sua renda.` };
    upfront = price - principal - tradeIn;
  }
  if (st.money < upfront) return { ok: false, message: `Faltam recursos: ${fmt(Math.max(0, upfront))} ${financed ? "de entrada" : "à vista"}${old ? " (já com o carro atual na troca)" : ""}.` };
  st.money -= upfront;
  tx(ctx, p, "BENS", -upfront, `Compra: ${def.label}${old ? " (com troca)" : ""}${financed ? ", entrada" : ""}`);
  story.car = { model, value: price, level: worldPriceLevel(ctx.world), since: ctx.date, loan };
  syncAssets(ctx.s, st, ctx.date);
  return { ok: true, message: `${def.label.charAt(0).toUpperCase()}${def.label.slice(1)} na garagem por ${fmt(price)}${loan ? `: 48 prestações de ${fmt(loan.installment)}` : ""}${old ? `. O antigo entrou na troca por ${fmt(Math.max(0, tradeIn))}` : ""}.` };
}

export function sellCar(ctx: Ctx, p: PersonRow, st: PersonStateRow): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const car = story.car;
  if (!car) return { ok: false, message: "Você não tem carro." };
  const net = Math.round(carValue(ctx.s, car, ctx.date) * 0.92) - (car.loan?.balance ?? 0);
  st.money += net;
  tx(ctx, p, "BENS", net, `Venda: ${CARS[car.model].label}`);
  if (st.money < 0) {
    st.debt += -st.money;
    st.money = 0;
  }
  story.car = null;
  syncAssets(ctx.s, st, ctx.date);
  return { ok: true, message: `Vendido. ${fmt(net)} entraram na conta${car.loan ? " (já descontado o saldo do financiamento)" : ""}.` };
}

export function payOffLoan(ctx: Ctx, p: PersonRow, st: PersonStateRow, which: "casa" | "carro"): DealResult {
  const story = ensureHousing(ctx.s, p, st, ctx.date);
  const holder = which === "casa" ? story.home : story.car;
  const loan = holder?.loan;
  if (!holder || !loan) return { ok: false, message: "Não há financiamento para quitar." };
  if (st.money < loan.balance) return { ok: false, message: `Para quitar é preciso ${fmt(loan.balance)} na conta.` };
  st.money -= loan.balance;
  tx(ctx, p, "AMORTIZACAO", -loan.balance, `Quitação do financiamento (${which})`);
  holder.loan = null;
  return { ok: true, message: `Financiamento ${which === "casa" ? "da casa" : "do carro"} quitado: ${fmt(loan.balance)}.` };
}

/** Rótulo da moradia ("Aluguel · médio padrão no Centro"). */
export function homeLabel(home: Home): string {
  switch (home.kind) {
    case "FAMILIA":
      return `Com a família, no ${home.bairro}`;
    case "ALUGUEL":
      return `Aluguel: ${tierLabel(home.tier)} no ${home.bairro}`;
    case "PROPRIA":
      return `Casa própria: ${tierLabel(home.tier)} no ${home.bairro}`;
    case "RUA":
      return "Sem casa";
  }
}

