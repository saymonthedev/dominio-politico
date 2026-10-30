import { addDays, ageAt, type ISODate } from "../calendar";
import type { PersonRow, PersonStateRow } from "../types";
import type { ScheduledStory, StoryEvent, StoryLogEntry, StoryState } from "./types";

export const STORY_VERSION = 1;
/** histórico guardado por personagem (o resumo final usa os marcos); fica no estado gravado a cada dia, então é enxuto */
export const LOG_LIMIT = 160;
export const QUEUE_LIMIT = 40;

/** Saúde inicial: boa na juventude, um pouco menor com a idade. */
export function initialHealth(age: number): number {
  return Math.round(Math.max(55, Math.min(95, 96 - Math.max(0, age - 28) * 0.45)));
}

export function emptyStory(age = 35): StoryState {
  return {
    v: STORY_VERSION,
    pending: [],
    log: [],
    queue: [],
    flags: {},
    seen: {},
    lastEvent: null,
    health: initialHealth(age),
    ended: null,
    counters: {},
  };
}

/** História do personagem (criada na primeira vez que é usada). */
export function storyOf(st: PersonStateRow, p?: PersonRow, date?: ISODate): StoryState {
  if (!st.story) st.story = emptyStory(p && date ? ageAt(p.birth_year, date) : 35);
  const s = st.story;
  s.pending ??= [];
  s.log ??= [];
  s.queue ??= [];
  s.flags ??= {};
  s.seen ??= {};
  s.counters ??= {};
  s.health ??= 80;
  s.ended ??= null;
  s.lastEvent ??= null;
  s.promises ??= [];
  return s;
}

export function pushLog(s: StoryState, entry: StoryLogEntry): void {
  s.log.unshift(entry);
  if (s.log.length > LOG_LIMIT) {
    // mantém os marcos antigos e descarta o miúdo
    const keep = s.log.slice(0, LOG_LIMIT - 40);
    const oldMilestones = s.log.slice(LOG_LIMIT - 40).filter((e) => e.milestone).slice(0, 40);
    s.log = [...keep, ...oldMilestones];
  }
}

export function count(s: StoryState, key: string, by = 1): void {
  s.counters[key] = (s.counters[key] ?? 0) + by;
}

/**
 * Marca uma continuação para daqui a alguns dias. Outros módulos (filiação,
 * eleições, crime) usam isto para transformar acontecimentos do motor em
 * eventos com escolha para o jogador.
 */
export function scheduleStory(st: PersonStateRow, def: string, due: ISODate, data: Record<string, string | number> = {}, from?: string): void {
  const s = storyOf(st);
  if (s.ended) return;
  // a mesma continuação, com os mesmos dados, não entra duas vezes
  const key = JSON.stringify(data);
  if (s.queue.some((q) => q.def === def && JSON.stringify(q.data) === key)) return;
  s.queue.push({ def, due, data, from });
  s.queue.sort((a, b) => a.due.localeCompare(b.due));
  if (s.queue.length > QUEUE_LIMIT) s.queue = s.queue.slice(0, QUEUE_LIMIT);
}

export function scheduleIn(st: PersonStateRow, today: ISODate, def: string, days: number, data: Record<string, string | number> = {}, from?: string): ScheduledStory {
  const item = { def, due: addDays(today, Math.max(0, Math.round(days))), data, from };
  scheduleStory(st, def, item.due, data, from);
  return item;
}

export function pendingBlocking(s: StoryState | null | undefined): StoryEvent | undefined {
  return s?.pending.find((e) => e.blocking);
}

export function flag(s: StoryState, key: string): string | number | boolean | undefined {
  return s.flags[key];
}

export function flagNum(s: StoryState, key: string): number {
  const v = s.flags[key];
  return typeof v === "number" ? v : v ? 1 : 0;
}

/** Quantas vezes um evento aconteceu nesta carreira. */
export function seenCount(s: StoryState, def: string): number {
  return s.seen[def]?.n ?? 0;
}

/**
 * Fecha um acontecimento pendente que foi resolvido por outra tela (ex.: convite
 * respondido no resumo do período): sai da lista de pendentes e entra no
 * histórico com o que foi decidido, para nunca ficar uma escolha "fantasma".
 */
export function closeStory(st: PersonStateRow, def: string, key: string, value: string, date: ISODate, choiceLabel: string, outcome: string): void {
  const s = st.story;
  if (!s) return;
  const hit = s.pending.filter((e) => e.def === def && String(e.data[key]) === value);
  if (!hit.length) return;
  s.pending = s.pending.filter((e) => !hit.includes(e));
  for (const ev of hit) pushLog(s, { id: ev.id, def: ev.def, on: date, title: ev.title, tags: ev.tags, kind: ev.kind, choiceLabel, outcome, who: ev.who ?? null });
}
