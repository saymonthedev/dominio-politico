import type { ISODate } from "./calendar";
import { formatDatePt } from "./calendar";
import { buildNarrativeFacts, evaluatePolicy, isReal, validateRenderedText, type PolicySubject } from "./news/policy";
import { defaultNarrativeProvider, type NarrativeProvider } from "./news/narrative";
import { outletsFor } from "./news/outlets";
import { TEMPLATES } from "./news/templates";
import { detId, rngFor, type Rng } from "./rng";
import type { Ruleset } from "./ruleset";
import type {
  EconomyRow,
  NewsRow,
  PersonRow,
  PersonStateRow,
  TableName,
  TableRows,
  WorldEventRow,
  WorldRow,
} from "./types";

export const STATEFUL_TABLES = [
  "persons",
  "person_states",
  "parties",
  "factions",
  "memberships",
  "affiliation_requests",
  "relationships",
  "elections",
  "races",
  "candidacies",
  "mandates",
  "bills",
  "policies",
  "illicit_acts",
  "investigations",
  "rumors",
  "debates",
  "voter_segments",
] as const;

export type StatefulTable = (typeof STATEFUL_TABLES)[number];

export type Tables = { [K in StatefulTable]: Map<string, TableRows[K]> };

export interface WorldState {
  world: WorldRow;
  economy: EconomyRow;
  ruleset: Ruleset;
  t: Tables;
}

export function emptyTables(): Tables {
  const t = {} as Record<StatefulTable, Map<string, unknown>>;
  for (const name of STATEFUL_TABLES) t[name] = new Map();
  return t as Tables;
}

/** Coletor de mudanças: tudo é upsert por id, o que torna a persistência idempotente. */
export class Changes {
  readonly rows = new Map<TableName, Map<string, unknown>>();

  add<K extends TableName>(table: K, row: TableRows[K]): void {
    let m = this.rows.get(table);
    if (!m) {
      m = new Map();
      this.rows.set(table, m);
    }
    m.set((row as { id: string }).id, row);
  }

  count(): number {
    let n = 0;
    for (const m of this.rows.values()) n += m.size;
    return n;
  }

  get<K extends TableName>(table: K): TableRows[K][] {
    return [...(this.rows.get(table)?.values() ?? [])] as TableRows[K][];
  }

  merge(other: Changes): void {
    for (const [table, m] of other.rows) for (const row of m.values()) this.add(table, row as never);
  }

  toJSON(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const [table, m] of this.rows) out[table] = [...m.values()];
    return out;
  }
}

export interface NewsOptions {
  facts: Record<string, string | number>;
  personIds?: string[];
  geography?: string;
  eventId?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  userId?: string | null;
  sourceId?: string | null;
  importance?: number;
  factual?: boolean;
}

export class Ctx {
  private seq = 0;
  readonly changes: Changes;
  readonly policyLog: Array<{ kind: string; reasons: string[] }> = [];

  constructor(
    readonly s: WorldState,
    readonly phase: string = "tick",
    changes?: Changes,
    readonly narrative: NarrativeProvider = defaultNarrativeProvider,
  ) {
    this.changes = changes ?? new Changes();
  }

  /** Zera o contador de ids no início de cada dia: ids não dependem do tamanho do lote de ticks. */
  beginTick(): void {
    this.seq = 0;
  }

  get world(): WorldRow {
    return this.s.world;
  }

  get date(): ISODate {
    return this.s.world.game_date;
  }

  get tick(): number {
    return this.s.world.tick;
  }

  get t(): Tables {
    return this.s.t;
  }

  rng(subsystem: string, key: string | number = ""): Rng {
    return rngFor(this.s.world.seed, `${this.phase}:${subsystem}`, this.s.world.tick, String(key));
  }

  id(prefix: string, ...parts: Array<string | number>): string {
    return detId(prefix, this.s.world.seed, this.phase, this.s.world.tick, ++this.seq, ...parts);
  }

  save<K extends StatefulTable>(table: K, row: TableRows[K]): void {
    (this.s.t[table] as Map<string, TableRows[K]>).set((row as { id: string }).id, row);
    this.changes.add(table, row);
  }

  saveWorld(): void {
    this.changes.add("worlds", this.s.world);
  }

  saveEconomy(row: EconomyRow): void {
    this.s.economy = row;
    this.changes.add("economy_snapshots", row);
  }

  insert<K extends TableName>(table: K, row: TableRows[K]): void {
    this.changes.add(table, row);
  }

  person(id: string | null | undefined): PersonRow | undefined {
    return id ? this.s.t.persons.get(id) : undefined;
  }

  pstate(id: string): PersonStateRow | undefined {
    return this.s.t.person_states.get(id);
  }

  emit(type: string, opts: { actors?: string[]; geography?: string; payload?: Record<string, unknown> } = {}): WorldEventRow {
    const id = this.id("evt", type);
    const ev: WorldEventRow = {
      id,
      world_id: this.world.id,
      tick: this.tick,
      type,
      game_date: this.date,
      actors: opts.actors ?? [],
      geography: opts.geography ?? "BR",
      payload: opts.payload ?? {},
      seed: `${this.world.seed}|${this.phase}|${this.tick}|${id}`,
    };
    this.insert("world_events", ev);
    return ev;
  }

  /**
   * Pipeline de notícia: evento decidido pelo motor → fatos estruturados →
   * policy para pessoas reais → template → validação → publicação.
   */
  publish(kind: string, opts: NewsOptions): NewsRow | null {
    const tpl = TEMPLATES[kind];
    if (!tpl) throw new Error(`Template desconhecido: ${kind}`);
    const subjects: PolicySubject[] = (opts.personIds ?? [])
      .map((pid) => this.person(pid))
      .filter((p): p is PersonRow => !!p)
      .map((p) => ({ id: p.id, name: p.name, kind: p.kind, source_id: p.source_id }));
    const policy = evaluatePolicy({
      claims: tpl.claims,
      subjects,
      sourceId: opts.sourceId,
      integrityMode: this.world.election_integrity_mode,
    });
    if (!policy.allowed) {
      this.policyLog.push({ kind, reasons: policy.reasons });
      return null;
    }
    const rng = this.rng("news", `${kind}:${this.seq}`);
    const facts = buildNarrativeFacts({ date: formatDatePt(this.date), ...opts.facts }, subjects, tpl.claims);
    const rendered = this.narrative.render(kind, facts, rng);
    const realPersons = [...this.s.t.persons.values()].filter((p) => isReal(p.kind));
    const validation = validateRenderedText(
      `${rendered.headline}\n${rendered.body}`,
      realPersons,
      subjects.filter((s) => isReal(s.kind)),
    );
    if (!validation.allowed) {
      this.policyLog.push({ kind, reasons: validation.reasons });
      return null;
    }
    const outlet = rng.pick(outletsFor(tpl.category));
    const row: NewsRow = {
      id: this.id("news", kind),
      world_id: this.world.id,
      event_id: opts.eventId ?? null,
      tick: this.tick,
      game_date: this.date,
      outlet: outlet.name,
      category: tpl.category,
      headline: rendered.headline,
      body: rendered.body,
      geography: opts.geography ?? "BR",
      person_ids: opts.personIds ?? [],
      importance: opts.importance ?? tpl.importance,
      visibility: opts.visibility ?? "PUBLIC",
      user_id: opts.userId ?? null,
      factual: !!opts.factual && !!opts.sourceId,
      source_id: opts.sourceId ?? null,
    };
    this.insert("news_articles", row);
    return row;
  }

  notify(personId: string, title: string, body: string, link: string | null = null): void {
    const p = this.person(personId);
    if (!p || !p.user_id) return;
    this.insert("notifications", {
      id: this.id("ntf", personId),
      world_id: this.world.id,
      user_id: p.user_id,
      person_id: personId,
      tick: this.tick,
      game_date: this.date,
      title,
      body,
      link,
      read_at: null,
    });
  }

  /** Notícia privada de carreira (feed pessoal do jogador). */
  careerNews(personId: string, title: string, body: string): void {
    const p = this.person(personId);
    if (!p) return;
    this.publish("CAREER_LOCAL", {
      facts: { title, body },
      personIds: [personId],
      geography: p.uf,
      visibility: p.user_id ? "PRIVATE" : "PUBLIC",
      userId: p.user_id,
    });
  }
}
