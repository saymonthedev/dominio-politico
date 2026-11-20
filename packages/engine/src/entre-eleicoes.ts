import type { ActionDef } from "./actions";
import { formatDatePt, type ISODate } from "./calendar";
import { cityName } from "./cities";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Atividades entre eleições (19/11), para os anos parados entre uma votação e outra:
 *
 * - Conselho Tutelar: eleição sem partido, de 4 em 4 anos (a unificada: 2015, 2019, 2023, 2027...),
 *   no 1º domingo de outubro. Inscrição de abril a julho; conta o trabalho na comunidade até a
 *   votação. Quem vence tem mandato de 4 anos a partir de 10 de janeiro, com remuneração.
 * - Cargo de confiança: assessor(a) da bancada do próprio partido (Câmara Municipal, Assembleia ou
 *   Câmara dos Deputados). Quem nomeia é a bancada, a instituição: nenhuma pessoa real age na
 *   história do jogador. Rende salário e espaço no partido.
 *
 * Nos dois casos, a profissão fica em licença; e quem se lança pré-candidato deixa o posto
 * (desincompatibilização).
 */

export type ConselhoStatus = "CANDIDATO" | "ELEITO" | "NAO_ELEITO" | "RENUNCIOU" | "ENCERRADO";

export interface ConselhoState {
  year: number;
  status: ConselhoStatus;
  /** município da candidatura */
  city: string;
  /** ações na comunidade desde a inscrição (até a votação) */
  actions: number;
  votes?: number;
  from?: ISODate;
  until?: ISODate;
}

export type ConfiancaWhere = "CAMARA_MUNICIPAL" | "ASSEMBLEIA" | "CAMARA";

export interface ConfiancaState {
  where: ConfiancaWhere;
  party: string;
  label: string;
  since: ISODate;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Ano de eleição unificada do Conselho Tutelar (o seguinte ao da eleição presidencial). */
export const isConselhoYear = (y: number) => y % 4 === 3;

export function nextConselhoYear(y: number): number {
  let n = y;
  while (!isConselhoYear(n)) n++;
  return n;
}

/** 1º domingo de outubro. */
export function conselhoVoteDate(y: number): ISODate {
  const d = new Date(Date.UTC(y, 9, 1));
  d.setUTCDate(1 + ((7 - d.getUTCDay()) % 7));
  return iso(d);
}

export const conselhoRegistration = (y: number) => ({ start: `${y}-04-01`, end: `${y}-07-31` });

/** Remuneração de referência (R$ de 2026), corrigida pelo nível de preços na hora de pagar. */
const CONSELHO_PAY = 4_000;
const CONFIANCA_PAY: Record<ConfiancaWhere, number> = { CAMARA_MUNICIPAL: 5_000, ASSEMBLEIA: 8_500, CAMARA: 12_000 };
const CONFIANCA_HOUSE: Record<ConfiancaWhere, { office: string; house: (p: PersonRow, ctx: Ctx) => string }> = {
  CAMARA_MUNICIPAL: { office: "VEREADOR", house: (p, ctx) => `Câmara Municipal de ${cityName(ctx.s, p.municipality) ?? "sua cidade"}` },
  ASSEMBLEIA: { office: "DEP_ESTADUAL", house: (p) => (p.uf === "DF" ? "Câmara Legislativa do DF" : `Assembleia Legislativa (${p.uf})`) },
  CAMARA: { office: "DEP_FEDERAL", house: () => "Câmara dos Deputados" },
};

export function conselhoServing(c: ConselhoState | null | undefined, date: ISODate): c is ConselhoState & { from: ISODate; until: ISODate } {
  return !!c && c.status === "ELEITO" && !!c.from && !!c.until && c.from <= date && date <= c.until;
}

/** O posto entre eleições que paga no mês: Conselho Tutelar (em exercício) ou cargo de confiança. */
export function betweenJob(st: Pick<PersonStateRow, "story">, date: ISODate): { label: string; ref: number } | null {
  const c = st.story?.conselho;
  if (conselhoServing(c, date)) return { label: "Remuneração de conselheiro(a) tutelar", ref: CONSELHO_PAY };
  const k = st.story?.confianca;
  if (k) return { label: `Salário de ${k.label}`, ref: CONFIANCA_PAY[k.where] };
  return null;
}

/** O posto de quem está entre eleições, para os cabeçalhos ("conselheiro(a) tutelar"). */
export function betweenTitle(st: Pick<PersonStateRow, "story">, date: ISODate): string | null {
  if (conselhoServing(st.story?.conselho, date)) return "conselheiro(a) tutelar";
  return st.story?.confianca?.label ?? null;
}

/** Ação na comunidade de quem está inscrito no Conselho Tutelar conta para a votação (a inscrição, não). */
export function countConselho(st: PersonStateRow, date: ISODate, category: string, actionId: string): void {
  const c = st.story?.conselho;
  if (c?.status === "CANDIDATO" && category === "BASE" && actionId !== "candidatar_conselho" && date <= conselhoVoteDate(c.year)) c.actions += 1;
}

/** Pré-candidatura a outro cargo: deixa o conselho e o cargo de confiança. Devolve o aviso. */
export function leaveForCandidacy(ctx: Ctx, p: PersonRow, st: PersonStateRow): string | null {
  const story = storyOf(st, p, ctx.date);
  const notes: string[] = [];
  const c = story.conselho;
  if (c && (c.status === "CANDIDATO" || conselhoServing(c, ctx.date))) {
    notes.push(c.status === "CANDIDATO" ? "Sua candidatura ao Conselho Tutelar foi retirada." : "Você renunciou ao Conselho Tutelar para disputar a eleição.");
    c.status = "RENUNCIOU";
  }
  if (story.confianca) {
    notes.push(`Você deixou o cargo de ${story.confianca.label} para disputar (desincompatibilização).`);
    story.confianca = null;
  }
  return notes.length ? notes.join(" ") : null;
}

const ageAt = (p: PersonRow, date: ISODate) => Number(date.slice(0, 4)) - p.birth_year;

export const BETWEEN_ACTIONS: ActionDef[] = [
  {
    id: "candidatar_conselho",
    label: "Candidatar-se ao Conselho Tutelar",
    description:
      "Eleição sem partido, de 4 em 4 anos, para cuidar dos direitos de crianças e adolescentes da sua cidade. Conta o trabalho na comunidade: cada ação nela até a votação ajuda. Mandato de 4 anos, com remuneração.",
    category: "BASE",
    energy: 10,
    available: (ctx, p, st) => {
      const y = Number(ctx.date.slice(0, 4));
      const c = st.story?.conselho;
      if (conselhoServing(c, ctx.date)) return "Você já é conselheiro(a) tutelar.";
      if (c?.status === "CANDIDATO") return `Candidatura registrada: a votação é em ${formatDatePt(conselhoVoteDate(c.year))}.`;
      if (p.office_code) return "Quem tem mandato não pode ser conselheiro(a) tutelar.";
      if (p.stage === "PRE_CANDIDATO" || p.stage === "CANDIDATO") return "Quem disputa outra eleição não pode concorrer ao conselho.";
      const reg = conselhoRegistration(y);
      if (!isConselhoYear(y) || ctx.date < reg.start || ctx.date > reg.end) {
        const next = ctx.date > reg.end || !isConselhoYear(y) ? nextConselhoYear(isConselhoYear(y) ? y + 1 : y) : y;
        return `Inscrições de abril a julho de ${next}; a votação é em ${formatDatePt(conselhoVoteDate(next))}.`;
      }
      if (ageAt(p, ctx.date) < 21) return "É preciso ter 21 anos ou mais.";
      return null;
    },
    run: ({ ctx, p, st }) => {
      const y = Number(ctx.date.slice(0, 4));
      const story = storyOf(st, p, ctx.date);
      story.conselho = { year: y, status: "CANDIDATO", city: p.municipality, actions: 0 };
      const city = cityName(ctx.s, p.municipality) ?? "sua cidade";
      return {
        ok: true,
        message: `Candidatura ao Conselho Tutelar de ${city} registrada. A votação é em ${formatDatePt(conselhoVoteDate(y))}, sem partido: até lá, cada ação na comunidade conta.`,
      };
    },
  },
  {
    id: "renunciar_conselho",
    label: "Renunciar ao Conselho Tutelar",
    description: "Deixar o mandato de conselheiro(a) tutelar antes do fim. A remuneração para no mês seguinte.",
    category: "BASE",
    energy: 0,
    confirm: "Você vai deixar o Conselho Tutelar. Não dá para voltar neste mandato.",
    available: (ctx, _p, st) => (conselhoServing(st.story?.conselho, ctx.date) ? null : "Você não está no Conselho Tutelar."),
    run: ({ ctx, p, st }) => {
      const c = storyOf(st, p, ctx.date).conselho!;
      c.status = "RENUNCIOU";
      return { ok: true, message: "Você renunciou ao Conselho Tutelar." };
    },
  },
  {
    id: "pedir_cargo_confianca",
    label: "Pedir um cargo de confiança",
    description:
      "Trabalhar como assessor(a) da bancada do seu partido na Câmara Municipal, na Assembleia ou na Câmara dos Deputados. Rende salário e espaço no partido; quem tem mais espaço no partido tem mais chance. A profissão fica em licença.",
    category: "PARTIDO",
    energy: 10,
    params: [
      {
        name: "where",
        label: "Onde",
        type: "choice",
        options: [
          { value: "CAMARA_MUNICIPAL", label: "Câmara Municipal da sua cidade" },
          { value: "ASSEMBLEIA", label: "Assembleia Legislativa do seu estado" },
          { value: "CAMARA", label: "Câmara dos Deputados" },
        ],
      },
    ],
    available: (ctx, p, st) => {
      if (!p.party_id) return "Requer filiação.";
      if (p.office_code) return "Quem tem mandato não ocupa cargo de confiança.";
      if (st.story?.confianca) return `Você já é ${st.story.confianca.label}.`;
      if (conselhoServing(st.story?.conselho, ctx.date)) return "Conselheiro(a) tutelar não acumula cargo de confiança.";
      if (p.stage === "PRE_CANDIDATO" || p.stage === "CANDIDATO") return "Em pré-candidatura ou campanha, não dá para assumir cargo de confiança.";
      const last = st.story?.flags?.confianca_tentativa;
      if (typeof last === "string" && last > addDaysIso(ctx.date, -30)) return `A bancada respondeu há pouco. Tente de novo a partir de ${formatDatePt(addDaysIso(last, 30))}.`;
      return null;
    },
    run: ({ ctx, p, st, params, rng }) => {
      const where = params.where as ConfiancaWhere;
      const spec = CONFIANCA_HOUSE[where];
      if (!spec) return { ok: false, message: "Escolha onde." };
      const party = ctx.t.parties.get(p.party_id!)!;
      const geo = where === "CAMARA_MUNICIPAL" ? p.municipality : p.uf;
      // bancada: eleitos em exercício ou a tomar posse; na câmara de uma cidade que o mundo ainda não
      // elegeu, a composição do ponto de partida
      const house_mandates = [...ctx.t.mandates.values()].filter((m) => (m.status === "ATIVO" || m.status === "FUTURO") && m.office_code === spec.office && m.geo === geo);
      const bench =
        house_mandates.filter((m) => m.person_id !== p.id && ctx.t.persons.get(m.person_id)?.party_id === party.id).length ||
        (where === "CAMARA_MUNICIPAL" && !house_mandates.length ? (ctx.s.cities?.get(p.municipality)?.council?.[party.acronym] ?? 0) : 0);
      const house = spec.house(p, ctx);
      if (!bench) return { ok: false, message: `O ${party.acronym} não tem bancada na ${house}. Escolha outra Casa.` };
      const story = storyOf(st, p, ctx.date);
      story.flags.confianca_tentativa = ctx.date;
      const chance = Math.max(0.1, Math.min(0.9, 0.2 + st.party_standing / 140 + st.political_capital / 300 + Math.min(bench, 6) * 0.02));
      if (!rng.chance(chance)) {
        return { ok: true, message: `A bancada do ${party.acronym} na ${house} não tem vaga para você agora. Ganhe espaço no partido e tente de novo em 30 dias.` };
      }
      const label = `assessor(a) da bancada do ${party.acronym} na ${house}`;
      story.confianca = { where, party: party.id, label, since: ctx.date };
      return { ok: true, message: `Você agora é ${label}. A profissão fica em licença; o salário entra no fechamento do mês.` };
    },
  },
  {
    id: "deixar_cargo_confianca",
    label: "Deixar o cargo de confiança",
    description: "Pedir exoneração e voltar à profissão.",
    category: "PARTIDO",
    energy: 0,
    available: (_ctx, _p, st) => (st.story?.confianca ? null : "Você não ocupa cargo de confiança."),
    run: ({ ctx, p, st }) => {
      const story = storyOf(st, p, ctx.date);
      const label = story.confianca!.label;
      story.confianca = null;
      return { ok: true, message: `Você deixou o cargo de ${label} e voltou à profissão.` };
    },
  },
];

function addDaysIso(d: ISODate, days: number): ISODate {
  const x = new Date(`${d}T12:00:00Z`);
  x.setUTCDate(x.getUTCDate() + days);
  return iso(x);
}

/**
 * Todo dia do mundo: a votação do Conselho Tutelar (no 1º domingo de outubro), o fim dos mandatos
 * e o cargo de confiança de quem trocou de partido ou tomou posse num cargo eletivo.
 */
export function dailyBetween(ctx: Ctx): void {
  const y = Number(ctx.date.slice(0, 4));
  const voteDay = isConselhoYear(y) && ctx.date === conselhoVoteDate(y);
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    const story = st?.story;
    if (!st || !story) continue;
    const c = story.conselho;
    if (voteDay && c?.status === "CANDIDATO" && c.year === y) resolveConselho(ctx, p, st, c);
    else if (c?.status === "ELEITO" && c.until && ctx.date > c.until) {
      c.status = "ENCERRADO";
      ctx.notify(p.id, "Fim do mandato no Conselho Tutelar", "Seus 4 anos de conselheiro(a) tutelar terminaram. A remuneração para e a profissão volta.", "/jogo/carreira");
      ctx.save("person_states", st);
    }
    const k = story.confianca;
    if (k && (p.party_id !== k.party || p.office_code)) {
      story.confianca = null;
      ctx.notify(p.id, "Cargo de confiança encerrado", p.office_code ? `Você deixou o cargo de ${k.label} ao tomar posse.` : `Você deixou o cargo de ${k.label} ao sair do partido.`, "/jogo/carreira");
      ctx.save("person_states", st);
    }
  }
}

function resolveConselho(ctx: Ctx, p: PersonRow, st: PersonStateRow, c: ConselhoState): void {
  const rng = ctx.rng("conselho", `${p.id}:${c.year}`);
  const reach = st.reach?.[p.uf] ?? 0;
  const chance = Math.max(0.05, Math.min(0.92, 0.12 + Math.min(c.actions, 10) * 0.06 + p.reputation / 250 + reach * 0.6));
  const elected = rng.chance(chance);
  const electorate = ctx.s.cities?.get(c.city)?.electorate ?? 60_000;
  // eleição de pouco comparecimento: uns 8% do eleitorado
  const total = electorate * 0.08;
  const votes = Math.max(12, Math.round(total * (elected ? rng.range(0.025, 0.06) : rng.range(0.004, 0.018))));
  const city = cityName(ctx.s, c.city) ?? "sua cidade";
  c.votes = votes;
  if (elected) {
    c.status = "ELEITO";
    c.from = `${c.year + 1}-01-10`;
    c.until = `${c.year + 5}-01-09`;
    p.reputation = Math.min(100, p.reputation + 2);
    p.visibility = Math.min(100, p.visibility + 3);
    ctx.notify(p.id, "Eleito(a) para o Conselho Tutelar!", `Você foi eleito(a) conselheiro(a) tutelar de ${city} com ${votes.toLocaleString("pt-BR")} votos. A posse é em ${formatDatePt(c.from)}, para 4 anos.`, "/jogo/carreira");
    ctx.save("persons", p);
  } else {
    c.status = "NAO_ELEITO";
    ctx.notify(p.id, "Conselho Tutelar: não foi desta vez", `Você teve ${votes.toLocaleString("pt-BR")} votos para o Conselho Tutelar de ${city} e não ficou entre os eleitos. A próxima eleição é em ${c.year + 4}.`, "/jogo/carreira");
  }
  ctx.save("person_states", st);
}

/** No dia 1: o cargo de confiança dá espaço no partido; o conselho, reputação na comunidade. */
export function monthlyBetween(ctx: Ctx): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st?.story) continue;
    let touched = false;
    if (st.story.confianca) {
      st.party_standing = Math.min(100, st.party_standing + 1);
      st.political_capital = Math.min(100, st.political_capital + 1);
      touched = true;
    }
    if (conselhoServing(st.story.conselho, ctx.date)) {
      p.reputation = Math.min(100, Math.round((p.reputation + 0.3) * 10) / 10);
      ctx.save("persons", p);
      touched = true;
    }
    if (touched) ctx.save("person_states", st);
  }
}
