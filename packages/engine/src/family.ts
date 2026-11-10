import type { ActionDef, ActionResult } from "./actions";
import { worldPriceLevel } from "./finance";
import { Rng } from "./rng";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { ISODate } from "./calendar";
import type { LedgerItem, PersonRow, PersonStateRow } from "./types";

/**
 * Família do personagem jogador: pais, cônjuge e filhos.
 *
 * A família de origem é uma linha do tempo sorteada uma vez por personagem (sempre a mesma para o
 * mesmo personagem): os pais, o ano do casamento e o nascimento de cada filho. Assim ela vai
 * aparecendo com o passar dos anos de jogo e a tela e o motor sempre concordam, sem precisar gravar
 * nada. O que o jogador faz fica guardado por cima, na vida do personagem (story.family): a
 * proximidade com cada um, um casamento ou um filho que ele decidiu ter, e uma separação.
 */

export type FamilyRole = "CONJUGE" | "FILHO" | "PAI" | "MAE";

export interface FamilyMember {
  id: string;
  role: FamilyRole;
  name: string;
  /** ano de nascimento */
  born: number;
  /** proximidade (0–100) */
  bond: number;
  female: boolean;
}

/** O que o jogador mudou na família (o resto vem da linha do tempo sorteada). */
export interface FamilyState {
  /** proximidade de cada um (quem não está aqui usa a inicial) */
  bonds: Record<string, number>;
  /** casamento e filhos que o jogador decidiu ter */
  added: FamilyMember[];
  /** quem saiu da família (separação) */
  gone: string[];
  last_child?: ISODate | null;
  /** último mês em que a cobrança por ausência foi avisada */
  warned?: string | null;
}

export const ROLE_LABEL: Record<FamilyRole, string> = { CONJUGE: "Cônjuge", FILHO: "Filho", PAI: "Pai", MAE: "Mãe" };
export const roleLabel = (m: Pick<FamilyMember, "role" | "female">) =>
  m.role === "CONJUGE" ? (m.female ? "Esposa" : "Marido") : m.role === "FILHO" ? (m.female ? "Filha" : "Filho") : ROLE_LABEL[m.role];

const FEMALE = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Joana", "Karina", "Larissa", "Mariana", "Natália", "Patrícia", "Raquel", "Sabrina", "Tatiana", "Vanessa", "Yasmin", "Adriana", "Bruna", "Cláudia", "Débora", "Elaine", "Flávia", "Glória", "Lívia", "Antônia", "Cecília", "Francisca", "Luana", "Rosana", "Simone", "Valéria", "Zilda"];
const MALE = ["André", "Bruno", "Carlos", "Diego", "Eduardo", "Fábio", "Gustavo", "Henrique", "Igor", "João", "Leonardo", "Marcelo", "Nelson", "Otávio", "Paulo", "Rafael", "Sérgio", "Thiago", "Vinícius", "Wagner", "Alexandre", "Caio", "Davi", "Emerson", "Felipe", "Hugo", "Júlio", "Lucas", "Mateus", "Rodrigo", "Benedito", "Raimundo"];
const SURNAMES = ["Almeida", "Barbosa", "Cardoso", "Castro", "Costa", "Dias", "Farias", "Freitas", "Gomes", "Lima", "Lopes", "Martins", "Melo", "Moraes", "Moreira", "Nogueira", "Oliveira", "Pereira", "Ramos", "Ribeiro", "Rocha", "Santana", "Soares", "Teixeira", "Viana"];

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const yearOf = (d: ISODate) => Number(d.slice(0, 4));
const surnameOf = (p: PersonRow) => p.name.trim().split(/\s+/).slice(-1)[0] ?? "";

/** Linha do tempo da família de origem (sempre a mesma para o mesmo personagem). */
function timeline(p: PersonRow, seed: string): Array<FamilyMember & { from: number }> {
  const rng = new Rng(`${seed}|familia|${p.id}`);
  const sur = surnameOf(p);
  const out: Array<FamilyMember & { from: number }> = [];
  const fatherBorn = p.birth_year - rng.int(24, 36);
  const motherBorn = p.birth_year - rng.int(21, 34);
  out.push({ id: "pai", role: "PAI", name: `${rng.pick(MALE)} ${sur}`, born: fatherBorn, bond: rng.int(45, 75), female: false, from: 0 });
  out.push({ id: "mae", role: "MAE", name: `${rng.pick(FEMALE)} ${rng.pick(SURNAMES)} ${sur}`, born: motherBorn, bond: rng.int(50, 80), female: true, from: 0 });
  if (rng.chance(0.6)) {
    const married = p.birth_year + rng.int(23, 34);
    const female = rng.chance(0.5);
    out.push({ id: "conjuge", role: "CONJUGE", name: `${rng.pick(female ? FEMALE : MALE)} ${rng.pick(SURNAMES)}`, born: p.birth_year + rng.int(-4, 4), bond: rng.int(55, 80), female, from: married });
    const kids = rng.weighted([0, 1, 1, 2, 2, 3], () => 1);
    let year = married + rng.int(1, 3);
    for (let i = 0; i < kids; i++) {
      const fem = rng.chance(0.5);
      out.push({ id: `filho${i + 1}`, role: "FILHO", name: `${rng.pick(fem ? FEMALE : MALE)} ${sur}`, born: year, bond: rng.int(60, 85), female: fem, from: year });
      year += rng.int(2, 5);
    }
  }
  return out;
}

/** Quem morreu de velhice antes deste ano (pais muito idosos saem da lista). */
const outlived = (m: FamilyMember, year: number) => (m.role === "PAI" || m.role === "MAE") && year - m.born > 92;

export function familyState(st: PersonStateRow): FamilyState | undefined {
  return (st.story as { family?: FamilyState } | null)?.family;
}

/** A família de hoje: a linha do tempo até a data, mais o que o jogador mudou. */
export function familyOf(ctx: Pick<Ctx, "world" | "date">, p: PersonRow, st: PersonStateRow): FamilyMember[] {
  const year = yearOf(ctx.date);
  const f = familyState(st);
  const gone = new Set(f?.gone ?? []);
  const base = timeline(p, ctx.world.seed).filter((m) => m.from <= year && m.born <= year && !outlived(m, year) && !gone.has(m.id));
  // quem casou pela ação do jogo não tem também o cônjuge sorteado (e vice-versa)
  const added = (f?.added ?? []).filter((m) => !gone.has(m.id));
  const hasAddedSpouse = added.some((m) => m.role === "CONJUGE");
  const list = [...base.filter((m) => !(hasAddedSpouse && m.role === "CONJUGE")), ...added];
  return list.map(({ ...m }) => ({ id: m.id, role: m.role, name: m.name, born: m.born, female: m.female, bond: clamp(f?.bonds[m.id] ?? m.bond) }));
}

function familyStateOf(st: PersonStateRow, p: PersonRow, date: ISODate): FamilyState {
  const s = storyOf(st, p, date) as ReturnType<typeof storyOf> & { family?: FamilyState };
  s.family ??= { bonds: {}, added: [], gone: [] };
  s.family.bonds ??= {};
  s.family.added ??= [];
  s.family.gone ??= [];
  return s.family;
}

function addBond(ctx: Ctx, p: PersonRow, st: PersonStateRow, members: FamilyMember[], delta: number): void {
  const f = familyStateOf(st, p, ctx.date);
  for (const m of members) f.bonds[m.id] = Math.round(clamp(m.bond + delta));
}

/** Aproxima toda a família (um dia inteiro com eles). */
export function bondAll(ctx: Ctx, p: PersonRow, st: PersonStateRow, delta: number): void {
  addBond(ctx, p, st, familyOf(ctx, p, st), delta);
}

/** Filhos menores de idade (despesas da casa). */
export function dependents(ctx: Pick<Ctx, "world" | "date">, p: PersonRow, st: PersonStateRow): number {
  const year = yearOf(ctx.date);
  return familyOf(ctx, p, st).filter((m) => m.role === "FILHO" && year - m.born < 18).length;
}

/** Linha das despesas com os filhos no fechamento do mês. */
export function familyCosts(ctx: Ctx, p: PersonRow, st: PersonStateRow, level: number): LedgerItem[] {
  const kids = dependents(ctx, p, st);
  if (!kids) return [];
  return [{ kind: "FAMILIA", label: `Despesas com ${kids === 1 ? "o filho" : `os ${kids} filhos`} (escola, saúde, alimentação)`, amount: -Math.round(kids * 900 * level) }];
}

/**
 * Mês da família (dia 1): a proximidade cai devagar sem convivência, mais ainda com muito cansaço.
 * Família próxima ajuda a descansar; distante, pesa. Cônjuge muito distante cobra e, no limite, vai embora.
 */
export function monthlyFamily(ctx: Ctx): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st?.story) continue;
    const members = familyOf(ctx, p, st);
    if (!members.length) continue;
    const s = st.story;
    const tired = (s.fatigue ?? 25) >= 60;
    const f = familyStateOf(st, p, ctx.date);
    for (const m of members) f.bonds[m.id] = Math.round(clamp(m.bond - (m.role === "CONJUGE" || m.role === "FILHO" ? 3 : 2) - (tired ? 2 : 0)));
    const now = familyOf(ctx, p, st);
    const avg = now.reduce((a, m) => a + m.bond, 0) / now.length;
    if (avg >= 70) s.fatigue = Math.max(0, (s.fatigue ?? 25) - 3);
    else if (avg < 30) s.fatigue = Math.min(100, (s.fatigue ?? 25) + 3);
    const spouse = now.find((m) => m.role === "CONJUGE");
    const month = ctx.date.slice(0, 7);
    if (spouse && spouse.bond <= 0) {
      f.gone.push(spouse.id);
      delete f.bonds[spouse.id];
      ctx.notify(p.id, `${spouse.name} foi embora`, "Depois de meses de ausência e cobranças, o casamento acabou. Vocês se separaram.", "/jogo/familia");
    } else if (spouse && spouse.bond < 20 && f.warned !== month && ctx.rng(`familia-cobra:${p.id}`).chance(0.5)) {
      f.warned = month;
      ctx.notify(p.id, "Clima pesado em casa", `${spouse.name} reclama que você só vive para a política. Passe um tempo com a família antes que seja tarde.`, "/jogo/familia");
    }
    ctx.save("person_states", st);
  }
}

// ---------------------------------------------------------------------------
// Ações de família
// ---------------------------------------------------------------------------

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const price = (ctx: Ctx, base: number) => Math.max(10, Math.round((base * worldPriceLevel(ctx.world)) / 10) * 10);

function pay(ctx: Ctx, p: PersonRow, st: PersonStateRow, amount: number, description: string): void {
  st.money -= amount;
  ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "familia"), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind: "LAZER", amount: -amount, declared: true, game_date: ctx.date, description });
}

function rest(ctx: Ctx, p: PersonRow, st: PersonStateRow, fatigue: number): string {
  const s = storyOf(st, p, ctx.date);
  const before = s.fatigue ?? 25;
  s.fatigue = Math.round(clamp(before - fatigue) * 10) / 10;
  return `Cansaço ${before.toFixed(0)} → ${s.fatigue.toFixed(0)}.`;
}

interface Outing {
  id: string;
  label: string;
  description: string;
  cost: number;
  fatigue: number;
  bond: number;
  who: (m: FamilyMember) => boolean;
  missing: string;
  done: (names: string) => string;
}

const OUTINGS: Outing[] = [
  {
    id: "programa_a_dois",
    label: "Programa a dois",
    description: "Um jantar só vocês dois, sem celular e sem assessor. Aproxima o casal e descansa a cabeça.",
    cost: 280,
    fatigue: 10,
    bond: 14,
    who: (m) => m.role === "CONJUGE",
    missing: "Você não é casado(a).",
    done: (n) => `Noite boa com ${n}.`,
  },
  {
    id: "passeio_filhos",
    label: "Passear com os filhos",
    description: "Parque, cinema ou um sorvete: tempo de verdade com as crianças.",
    cost: 160,
    fatigue: 8,
    bond: 12,
    who: (m) => m.role === "FILHO",
    missing: "Você não tem filhos.",
    done: (n) => `Tarde de passeio com ${n}.`,
  },
  {
    id: "visitar_pais",
    label: "Visitar os pais",
    description: "Almoço de domingo na casa dos pais. Eles contam para os vizinhos que você apareceu.",
    cost: 90,
    fatigue: 6,
    bond: 14,
    who: (m) => m.role === "PAI" || m.role === "MAE",
    missing: "Seus pais já faleceram.",
    done: (n) => `Almoço com ${n}.`,
  },
];

const names = (list: FamilyMember[]) => {
  const first = list.map((m) => m.name.split(" ")[0]);
  return first.length <= 1 ? first.join("") : `${first.slice(0, -1).join(", ")} e ${first[first.length - 1]}`;
};

const outingActions: ActionDef[] = OUTINGS.map((o) => ({
  id: o.id,
  label: o.label,
  description: o.description,
  category: "VIDA",
  energy: 0,
  costFn: (ctx) => price(ctx, o.cost),
  available: (ctx, p, st) => {
    if (!familyOf(ctx, p, st).some(o.who)) return o.missing;
    const c = price(ctx, o.cost);
    return st.money < c ? `Custa ${fmt(c)}.` : null;
  },
  run: ({ ctx, p, st, dr }): ActionResult => {
    const who = familyOf(ctx, p, st).filter(o.who);
    if (!who.length) return { ok: false, message: o.missing };
    pay(ctx, p, st, price(ctx, o.cost), o.label);
    addBond(ctx, p, st, who, o.bond * dr(o.id));
    return { ok: true, message: `${o.done(names(who))} ${rest(ctx, p, st, o.fatigue * dr(`${o.id}:descanso`))}` };
  },
}));

const WEDDING = { simples: 4_000, festa: 25_000 };

const marry: ActionDef = {
  id: "casar",
  label: "Casar",
  description: "Oficializar a união: só no cartório, ou com festa para a família e os amigos (e alguns aliados).",
  category: "VIDA",
  energy: 10,
  params: [
    { name: "nome", label: "Nome de quem você vai casar", type: "text" },
    { name: "festa", label: "Cerimônia", type: "choice", options: [{ value: "simples", label: "Só no cartório" }, { value: "festa", label: "Com festa" }] },
  ],
  costFn: (ctx) => price(ctx, WEDDING.simples),
  available: (ctx, p, st) => {
    if (familyOf(ctx, p, st).some((m) => m.role === "CONJUGE")) return "Você já é casado(a).";
    if (yearOf(ctx.date) - p.birth_year < 18) return "Só a partir dos 18 anos.";
    return st.money < price(ctx, WEDDING.simples) ? `O casamento no cartório custa ${fmt(price(ctx, WEDDING.simples))}.` : null;
  },
  run: ({ ctx, p, st, params }): ActionResult => {
    const name = String(params.nome ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (name.length < 2) return { ok: false, message: "Escreva o nome de quem você vai casar." };
    const big = params.festa === "festa";
    const cost = price(ctx, big ? WEDDING.festa : WEDDING.simples);
    if (st.money < cost) return { ok: false, message: `${big ? "A festa" : "O cartório"} custa ${fmt(cost)}.` };
    const f = familyStateOf(st, p, ctx.date);
    const id = `conjuge-${ctx.date}`;
    f.added.push({ id, role: "CONJUGE", name, born: p.birth_year + ctx.rng(`casar:${p.id}`).int(-4, 4), bond: 85, female: FEMALE.includes(name.split(" ")[0]) });
    pay(ctx, p, st, cost, big ? "Casamento com festa" : "Casamento no cartório");
    if (big) p.reputation = clamp(p.reputation + 1);
    ctx.careerNews(p.id, `${p.name} se casa com ${name}`, big ? "A festa reuniu família, amigos e alguns aliados políticos." : "Cerimônia simples, no cartório, só para a família.");
    return { ok: true, message: `Você casou com ${name}${big ? ", com festa" : ", no cartório"}.` };
  },
};

const haveChild: ActionDef = {
  id: "ter_filho",
  label: "Ter um filho",
  description: "Aumentar a família. O bebê chega na hora, e as despesas da casa sobem todo mês até os 18 anos.",
  category: "VIDA",
  energy: 10,
  params: [{ name: "nome", label: "Nome do bebê", type: "text" }],
  costFn: (ctx) => price(ctx, 3_000),
  available: (ctx, p, st) => {
    if (!familyOf(ctx, p, st).some((m) => m.role === "CONJUGE")) return "Precisa ser casado(a).";
    if (yearOf(ctx.date) - p.birth_year > 55) return "Passou da idade para isso no jogo.";
    const last = familyState(st)?.last_child;
    if (last && ctx.date < `${yearOf(last) + 1}${last.slice(4)}`) return "Espere pelo menos um ano desde o último filho.";
    return st.money < price(ctx, 3_000) ? `O parto e o enxoval custam ${fmt(price(ctx, 3_000))}.` : null;
  },
  run: ({ ctx, p, st, params }): ActionResult => {
    const first = String(params.nome ?? "").replace(/\s+/g, " ").trim().split(" ")[0]?.slice(0, 30) ?? "";
    if (first.length < 2) return { ok: false, message: "Escreva o nome do bebê." };
    const f = familyStateOf(st, p, ctx.date);
    const name = `${first} ${surnameOf(p)}`;
    f.added.push({ id: `filho-${ctx.date}`, role: "FILHO", name, born: yearOf(ctx.date), bond: 90, female: FEMALE.includes(first) });
    f.last_child = ctx.date;
    pay(ctx, p, st, price(ctx, 3_000), "Parto e enxoval");
    ctx.careerNews(p.id, `Nasce ${name}`, `${p.name} anuncia o nascimento de ${first}.`);
    return { ok: true, message: `${first} chegou! As despesas com filhos entram no fechamento do mês.` };
  },
};

export const FAMILY_ACTIONS: ActionDef[] = [...outingActions, marry, haveChild];
export const FAMILY_ACTION_IDS = new Set(FAMILY_ACTIONS.map((a) => a.id).concat("dia_familia"));
