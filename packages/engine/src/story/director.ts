import { addDays, diffDays } from "../calendar";
import { isJailed } from "../crime";
import type { Ctx, WorldState } from "../state";
import type { PersonRow } from "../types";
import { STORY_DEFS } from "./catalog";
import { StoryCtx } from "./context";
import type { ChoiceDef, EventDef } from "./def";
import { Effects } from "./effects";
import { dailyLife } from "./life";
import { count, pushLog, storyOf } from "./state";
import type { Binding, StoryDelta, StoryEvent, StoryLogEntry } from "./types";

/**
 * Diretor de eventos. Todo dia, para cada jogador:
 *  1) vence os prazos (aplica a escolha padrão de quem não respondeu);
 *  2) dispara as continuações marcadas para hoje (histórias encadeadas);
 *  3) se o jogador está vivendo os dias (avançando o tempo), talvez dispara um
 *     acontecimento do contexto — com ritmo: dias tranquilos, sem empilhar
 *     decisões, sem repetir o mesmo tipo em sequência.
 */

/** Chance base de um acontecimento num dia, por momento da carreira. */
function baseChance(c: StoryCtx): number {
  switch (c.phase) {
    case "RETA_FINAL":
      return 0.42;
    case "CAMPANHA":
    case "SEGUNDO_TURNO":
      return 0.32;
    case "PRE":
    case "CONVENCAO":
      return 0.2;
    default:
      return c.p.office_code ? 0.18 : c.p.party_id ? 0.16 : 0.14;
  }
}

const DEFAULT_EXPIRES = { DECISAO: 5, OPORTUNIDADE: 14, INFO: 0 } as const;

export function isPresent(ctx: Ctx, personId: string): boolean {
  return !!ctx.s.focus?.has(personId);
}

export function storyCtx(ctx: Ctx, p: PersonRow, salt: string): StoryCtx | null {
  const st = ctx.pstate(p.id);
  if (!st) return null;
  return new StoryCtx(ctx, p, st, ctx.rng(`story:${salt}`, p.id));
}

function lockReason(c: StoryCtx, b: Binding, ch: ChoiceDef): string | null {
  if (ch.cost?.money && c.st.money < ch.cost.money) return `Exige ${`R$ ${Math.round(ch.cost.money).toLocaleString("pt-BR")}`}.`;
  if (ch.cost?.energy && c.st.energy < ch.cost.energy) return `Exige ${ch.cost.energy} de energia.`;
  return ch.requires?.(c, b) ?? null;
}

/** Um acontecimento com defeito nunca pode travar o dia do mundo. */
function guard<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (e) {
    if (typeof process !== "undefined" && process.env?.STORY_DEBUG) console.error(`[story] ${label}:`, e);
    return fallback;
  }
}

/** Coloca um acontecimento na vida do personagem. */
export function fireEvent(c: StoryCtx, def: EventDef, b: Binding): StoryEvent | null {
  return guard(`fire ${def.id}`, () => fireEventUnsafe(c, def, b), null);
}

function fireEventUnsafe(c: StoryCtx, def: EventDef, b: Binding): StoryEvent | null {
  const r = def.render(c, b);
  const choices = r.choices.map((ch) => ({ id: ch.id, label: ch.label, hint: ch.hint, tone: ch.tone, cost: ch.cost, locked: lockReason(c, b, ch) }));
  if (def.kind !== "INFO" && choices.length && choices.every((ch) => ch.locked)) return null;
  const ev: StoryEvent = {
    id: c.ctx.id("sty", c.p.id, def.id),
    def: def.id,
    on: c.date,
    expires: def.kind === "INFO" && !def.blocking ? null : addDays(c.date, def.expires ?? (def.kind === "INFO" ? 3 : DEFAULT_EXPIRES[def.kind])),
    kind: def.kind,
    blocking: def.blocking ?? def.kind === "DECISAO",
    tags: def.tags,
    title: r.title,
    text: r.text,
    who: r.who ? { id: r.who.id, name: r.who.name, role: r.who.role_label } : null,
    choices,
    data: b,
    fallback: def.fallback && choices.some((ch) => ch.id === def.fallback) ? def.fallback : choices[choices.length - 1]?.id,
  };
  const seen = c.s.seen[def.id];
  c.s.seen[def.id] = { n: (seen?.n ?? 0) + 1, last: c.date };
  c.s.lastEvent = c.date;
  count(c.s, "eventos");
  if (def.kind === "INFO" && !def.blocking) {
    // informativo: acontece e já entra no histórico (com as consequências, se houver)
    applyChoice(c, def, ev, choices[0]?.id ?? "ok", false);
  } else {
    c.s.pending.push(ev);
  }
  return ev;
}

export interface StoryOutcome {
  ok: boolean;
  message: string;
  title?: string;
  outcome?: string;
  deltas?: StoryDelta[];
  choiceLabel?: string;
}

function applyChoice(c: StoryCtx, def: EventDef, ev: StoryEvent, choiceId: string, auto: boolean): StoryLogEntry {
  const fx = new Effects(c);
  const outcome = def.resolve(c, ev.data, choiceId, fx);
  const choice = ev.choices.find((x) => x.id === choiceId);
  const entry: StoryLogEntry = {
    id: ev.id,
    def: def.id,
    on: c.date,
    title: ev.title,
    tags: ev.tags,
    kind: ev.kind,
    choice: choiceId,
    choiceLabel: choice?.label,
    outcome,
    deltas: fx.deltas(),
    milestone: def.milestone,
    auto: auto || undefined,
    who: ev.who ?? null,
  };
  pushLog(c.s, entry);
  if (choice?.tone) count(c.s, `tom:${choice.tone}`);
  if (auto) count(c.s, "sem_resposta");
  fx.commit();
  return entry;
}

/** Responde a um acontecimento pendente. */
export function resolveStory(ctx: Ctx, personId: string, eventId: string, choiceId: string, auto = false): StoryOutcome {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  if (!p || !st || p.kind !== "PLAYER") return { ok: false, message: "Personagem não encontrado." };
  const s = storyOf(st, p, ctx.date);
  const ev = s.pending.find((e) => e.id === eventId);
  if (!ev) return { ok: false, message: "Esse acontecimento já foi resolvido." };
  const def = STORY_DEFS[ev.def];
  const c = new StoryCtx(ctx, p, st, ctx.rng(`story-resolve:${ev.id}`, choiceId));
  s.pending = s.pending.filter((e) => e.id !== ev.id);
  if (!def || !guard(`valid ${ev.def}`, () => !def.valid || def.valid(c, ev.data), false)) {
    pushLog(s, { id: ev.id, def: ev.def, on: ctx.date, title: ev.title, tags: ev.tags, kind: ev.kind, outcome: "Isso já foi resolvido em outra tela.", auto: true });
    ctx.save("person_states", st);
    return { ok: true, message: "Isso já foi resolvido em outra tela.", title: ev.title, outcome: "Isso já foi resolvido em outra tela." };
  }
  let choice = ev.choices.find((x) => x.id === choiceId);
  if (!choice && auto) {
    choice = ev.choices[ev.choices.length - 1];
    choiceId = choice?.id ?? "ok";
  }
  if (!choice && ev.choices.length) {
    s.pending.push(ev);
    return { ok: false, message: "Escolha inválida." };
  }
  // custo e requisitos conferidos de novo: o dinheiro ou a energia podem ter mudado
  const choiceDef = guard(`render ${ev.def}`, () => def.render(c, ev.data).choices.find((x) => x.id === choiceId), undefined);
  const reason = choiceDef ? guard(`lock ${ev.def}`, () => lockReason(c, ev.data, choiceDef), null) : null;
  if (reason && !auto) {
    s.pending.push(ev);
    return { ok: false, message: reason };
  }
  const entry = guard(`resolve ${ev.def}`, () => applyChoice(c, def, ev, choiceId, auto), null);
  if (!entry) {
    pushLog(s, { id: ev.id, def: ev.def, on: ctx.date, title: ev.title, tags: ev.tags, kind: ev.kind, outcome: "A situação se resolveu sem você.", auto: true });
    ctx.save("person_states", st);
    return { ok: true, message: "A situação se resolveu sem você.", title: ev.title, outcome: "A situação se resolveu sem você." };
  }
  if (!auto) {
    // cada resposta conta como ação: novos ids e telas recarregadas
    st.action_seq += 1;
    ctx.save("person_states", st);
  }
  return { ok: true, message: entry.outcome, title: ev.title, outcome: entry.outcome, deltas: entry.deltas, choiceLabel: entry.choiceLabel };
}

/** Os pendentes que perderam o sentido saem; os vencidos recebem a escolha padrão. */
function sweepPending(c: StoryCtx): void {
  for (const ev of [...c.s.pending]) {
    const def = STORY_DEFS[ev.def];
    if (!def || !guard(`valid ${ev.def}`, () => !def.valid || def.valid(c, ev.data), false)) {
      c.s.pending = c.s.pending.filter((e) => e.id !== ev.id);
      continue;
    }
    if (ev.expires && ev.expires < c.date) {
      const fallback = ev.fallback ?? ev.choices[ev.choices.length - 1]?.id ?? "ok";
      const r = resolveStory(c.ctx, c.p.id, ev.id, fallback, true);
      if (r.ok && ev.kind !== "INFO") {
        const label = ev.choices.find((x) => x.id === fallback)?.label ?? "";
        c.ctx.notify(c.p.id, `Prazo vencido: ${ev.title}`, `Sem resposta até ${ev.expires}, valeu: "${label}". ${r.outcome ?? ""}`, "/jogo/carreira#historia");
      }
    }
  }
}

/** Continuações marcadas para hoje. */
function runQueue(c: StoryCtx): void {
  const due = c.s.queue.filter((q) => q.due <= c.date);
  if (!due.length) return;
  c.s.queue = c.s.queue.filter((q) => q.due > c.date);
  for (const q of due) {
    const def = STORY_DEFS[q.def];
    if (!def) continue;
    if (c.s.pending.some((e) => e.def === def.id && JSON.stringify(e.data) === JSON.stringify(q.data))) continue;
    const b = guard(`when ${def.id}`, () => def.when(c, q.data), null);
    if (!b) continue;
    fireEvent(c, def, b);
  }
}

/** Acontecimento do contexto, com ritmo e variedade. */
function contextual(c: StoryCtx): void {
  const s = c.s;
  if (s.pending.length >= 4) return;
  const blockingOpen = s.pending.some((e) => e.blocking);
  const quiet = s.lastEvent ? diffDays(c.date, s.lastEvent) : 30;
  let chance = baseChance(c);
  // depois de um acontecimento, uns dias de calma; depois de muita calma, algo acontece
  if (quiet <= 1) chance *= 0.3;
  else chance += Math.min(0.2, (quiet - 2) * 0.02);
  if (blockingOpen) chance *= 0.35;
  if (!c.rng.chance(chance)) return;
  const recentTags = [...s.pending.flatMap((e) => e.tags), ...s.log.slice(0, 4).flatMap((e) => e.tags)];
  const candidates: Array<{ def: EventDef; b: Binding; w: number }> = [];
  for (const def of Object.values(STORY_DEFS)) {
    if (def.chained) continue;
    const blocking = def.blocking ?? def.kind === "DECISAO";
    if (blockingOpen && blocking) continue;
    if (s.pending.some((e) => e.def === def.id)) continue;
    const seen = s.seen[def.id];
    if (def.max && (seen?.n ?? 0) >= def.max) continue;
    if (seen && diffDays(c.date, seen.last) < (def.cooldown ?? 60)) continue;
    const b = guard(`when ${def.id}`, () => def.when(c), null);
    if (!b) continue;
    let w = (def.weight ?? 1) * guard(`weight ${def.id}`, () => def.weightFn?.(c, b) ?? 1, 0);
    // o que já aconteceu muitas vezes (ou há pouco) perde a vez para o inédito
    if (seen) {
      w /= 1 + 0.18 * seen.n;
      if (diffDays(c.date, seen.last) < (def.cooldown ?? 60) * 2) w *= 0.5;
    }
    const overlap = def.tags.filter((t) => recentTags.includes(t)).length;
    if (overlap) w *= Math.pow(0.45, Math.min(2, overlap));
    if (w > 0) candidates.push({ def, b, w });
  }
  if (!candidates.length) return;
  const pick = c.rng.weighted(candidates, (x) => x.w);
  fireEvent(c, pick.def, pick.b);
}

/** Roda o dia das histórias para todos os jogadores. */
export function dailyStory(ctx: Ctx): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const c = storyCtx(ctx, p, "day");
    if (!c || c.s.ended) continue;
    dailyLife(c);
    if (c.s.ended) {
      ctx.save("persons", p);
      ctx.save("person_states", c.st);
      continue;
    }
    sweepPending(c);
    runQueue(c);
    if (isPresent(ctx, p.id) && !isJailed(c.st, ctx.date)) contextual(c);
    ctx.save("person_states", c.st);
  }
}

/** Pendentes para a tela (ordenados: os que seguram o tempo primeiro). */
export function pendingFor(src: Ctx | WorldState, personId: string): StoryEvent[] {
  const st = src.t.person_states.get(personId);
  if (!st?.story) return [];
  return [...st.story.pending].sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.on.localeCompare(b.on));
}

export { nextSaturday, weekdayName, WEEKDAYS } from "./time";
