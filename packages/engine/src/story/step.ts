import { day, weekday, type ISODate } from "../calendar";
import { isJailed } from "../crime";
import { OFFICES } from "../ruleset";
import { Ctx, type WorldState } from "../state";
import { advanceDay } from "../tick";
import { StoryCtx } from "./context";
import { pendingBlocking } from "./state";
import { WEEKDAYS } from "./time";
import type { StoryDelta, StoryEvent, StoryKind, StoryState, StoryTag, StoryWho } from "./types";
import { bairro } from "./catalog/util";

/**
 * "Viver os dias": o tempo anda um dia de cada vez para o jogador que avança.
 * Dias tranquilos passam sozinhos (com a rotina do dia); acontecimentos que
 * pedem decisão param o relógio até a resposta. Cada dia vira uma linha do
 * diário, para a tela mostrar a data correndo e o que aconteceu.
 */

export interface DayEvent {
  id: string;
  def: string;
  title: string;
  outcome: string;
  kind: StoryKind;
  tags: StoryTag[];
  deltas?: StoryDelta[];
  auto?: boolean;
  who?: StoryWho | null;
  choiceLabel?: string;
}

export interface DayDigest {
  date: ISODate;
  weekday: string;
  /** a frase do dia: o que marcou o dia ou a rotina */
  line: string;
  /** acontecimentos resolvidos no dia (informativos e prazos vencidos) */
  events: DayEvent[];
  /** acontecimentos novos que esperam resposta */
  pending: Array<{ id: string; title: string; kind: StoryKind; blocking: boolean; tags: StoryTag[] }>;
  /** manchete do dia (do país ou da sua carreira) */
  headline: { title: string; category: string } | null;
  /** variação de caixa e de energia no dia */
  money: number;
  energy: number;
  quiet: boolean;
}

export interface StepResult {
  ctx: Ctx;
  ticks: number;
  days: DayDigest[];
  /** por que parou antes do fim: decisão pendente, fim da carreira ou limite de tempo de processamento */
  stop: "decisao" | "fim" | "limite" | null;
  /** acontecimento que fez o relógio parar (novo, ou no último dia do prazo) */
  stopOn?: string;
}

/** Oportunidade sem resposta que vence se o dia virar: o relógio para uma vez para lembrar. */
function lastCall(story: StoryState | null | undefined, date: string): StoryEvent | undefined {
  return (story?.pending ?? []).find((e) => !e.blocking && e.kind !== "INFO" && e.choices.length > 0 && e.expires != null && e.expires <= date && !e.data.lastCall);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = <T>(key: string, list: readonly T[]): T => list[hash(key) % list.length];

/** Rotina do dia, quando nada de especial acontece. */
export function routineLine(c: StoryCtx): string {
  const wd = weekday(c.date);
  const key = `${c.p.id}:${c.date}`;
  const hood = bairro(c, `rotina:${c.date.slice(0, 7)}`);
  if (isJailed(c.st, c.date)) return "Mais um dia no regime fechado. O mundo segue lá fora.";
  if (day(c.date) === 1) return "Virada do mês: salário, contas, impostos e o extrato do mês anterior.";
  const phase = c.phase;
  if (phase === "CAMPANHA" || phase === "RETA_FINAL" || phase === "SEGUNDO_TURNO") {
    const camp = [
      `Reunião de coordenação às sete e panfletagem no ${hood}.`,
      `Caminhada no ${hood} e gravação de vídeos para as redes.`,
      "Feira livre de manhã, conversa com comerciantes à tarde.",
      "Encontro com lideranças comunitárias e agenda na periferia.",
      `Comício relâmpago no fim da tarde, no ${hood}.`,
      "Carreata pela cidade e bandeiraço nos semáforos.",
      "Almoço com apoiadores e planejamento da semana.",
    ];
    return camp[wd] ?? pick(key, camp);
  }
  if (c.p.office_code) {
    const exec = ["PREFEITO", "GOVERNADOR", "PRESIDENTE"].includes(c.p.office_code);
    const office = OFFICES[c.p.office_code].name.toLowerCase();
    if (wd === 0) return "Domingo em família, com o celular no silencioso (quase sempre).";
    if (wd === 6) return exec ? "Visita a obras e agenda nos bairros." : `Sábado nas bases, ouvindo moradores do ${hood}.`;
    return exec
      ? pick(key, ["Despachos e reuniões com o secretariado.", "Inauguração pequena e entrevista na rádio local.", "Reunião difícil sobre o orçamento.", "Audiência com prefeitos e lideranças."])
      : pick(key, [`Sessão no plenário: rotina de ${office}.`, "Reunião de comissão e atendimento no gabinete.", "Atendimento ao público no gabinete: pedidos de todo tipo.", "Discurso curto na tribuna e conversa nos corredores."]);
  }
  if (wd === 0) return pick(key, ["Domingo em família.", "Domingo de descanso.", `Almoço de domingo e conversa com vizinhos no ${hood}.`]);
  if (wd === 6) return c.p.party_id ? pick(key, [`Panfletagem do partido no ${hood}.`, "Sábado de folga.", "Plenária do partido de manhã, tarde livre."]) : pick(key, ["Sábado de folga.", `Feira no ${hood} e conversa com conhecidos.`, "Sábado em casa, resolvendo pendências."]);
  const work = c.jornada === 0 ? "Sem expediente: tempo para a política." : c.jornada < 1 ? `Meio período como ${c.professionLabel}.` : `Expediente normal como ${c.professionLabel}.`;
  if (c.p.party_id && (wd === 1 || wd === 3)) return `${work} À noite, reunião do diretório.`;
  return work;
}

/** Avança até `days` dias vivendo cada um; para em decisões que seguram o tempo. */
export function stepDays(state: WorldState, personId: string, opts: { days: number; budgetMs?: number; now?: () => number }): StepResult {
  const ctx = new Ctx(state, "tick");
  const now = opts.now ?? (() => 0);
  const start = now();
  const days: DayDigest[] = [];
  let stop: StepResult["stop"] = null;
  let stopOn: string | undefined;
  const prevFocus = state.focus;
  state.focus = new Set([...(prevFocus ?? []), personId]);
  try {
    for (let i = 0; i < opts.days; i++) {
      const p = state.t.persons.get(personId);
      const st = state.t.person_states.get(personId);
      if (!p || !st) break;
      if (p.status !== "ACTIVE" || st.story?.ended) {
        stop = "fim";
        break;
      }
      if (pendingBlocking(st.story)) {
        stop = "decisao";
        break;
      }
      const due = lastCall(st.story, state.world.game_date);
      if (due) {
        due.data.lastCall = 1;
        ctx.save("person_states", st);
        stop = "decisao";
        stopOn = due.id;
        break;
      }
      const seenLog = new Set((st.story?.log ?? []).slice(0, 40).map((e) => e.id));
      const seenPending = new Set((st.story?.pending ?? []).map((e) => e.id));
      const money0 = st.money;
      const energy0 = st.energy;
      advanceDay(ctx);
      const date = state.world.game_date;
      const story = st.story;
      const events: DayEvent[] = [];
      for (const e of story?.log ?? []) {
        if (seenLog.has(e.id)) break;
        events.push({ id: e.id, def: e.def, title: e.title, outcome: e.outcome, kind: e.kind, tags: e.tags, deltas: e.deltas, auto: e.auto, who: e.who, choiceLabel: e.choiceLabel });
      }
      events.reverse();
      const pending = (story?.pending ?? []).filter((e) => !seenPending.has(e.id)).map((e) => ({ id: e.id, title: e.title, kind: e.kind, blocking: e.blocking, tags: e.tags }));
      const news = ctx.changes
        .get("news_articles")
        .filter((n) => n.tick === state.world.tick && (n.visibility === "PUBLIC" || (p.user_id && n.user_id === p.user_id)))
        .sort((a, b) => Number(b.user_id === p.user_id) - Number(a.user_id === p.user_id) || b.importance - a.importance);
      const c = new StoryCtx(ctx, p, st, ctx.rng("story-day", personId));
      const highlight = pending[0]?.title ?? events.find((e) => e.kind !== "INFO" || !e.auto)?.title ?? events[0]?.title;
      days.push({
        date,
        weekday: WEEKDAYS[weekday(date)],
        line: highlight ?? (p.status === "ACTIVE" ? routineLine(c) : "Fim da jornada."),
        events,
        pending,
        headline: news[0] ? { title: news[0].headline, category: news[0].category } : null,
        money: Math.round(st.money - money0),
        energy: Math.round(st.energy - energy0),
        quiet: !events.length && !pending.length,
      });
      if (p.status !== "ACTIVE" || story?.ended) {
        stop = "fim";
        break;
      }
      if (pendingBlocking(story)) {
        stop = i < opts.days - 1 ? "decisao" : null;
        if (stop) break;
      }
      // toda escolha nova aparece na hora, mesmo as que podem esperar
      const fresh = (story?.pending ?? []).find((e) => !seenPending.has(e.id) && e.kind !== "INFO" && e.choices.length > 0);
      if (fresh) {
        stopOn = fresh.id;
        stop = i < opts.days - 1 ? "decisao" : null;
        if (stop) break;
      }
      if (opts.budgetMs && now() - start > opts.budgetMs && i < opts.days - 1) {
        stop = "limite";
        break;
      }
    }
  } finally {
    state.focus = prevFocus;
  }
  return { ctx, ticks: days.length, days, stop, stopOn };
}
