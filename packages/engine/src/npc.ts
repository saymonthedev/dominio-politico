import { ageAt } from "./calendar";
import { jitter, type Ideology } from "./ideology";
import { distinctName, freshName, PROFESSIONS } from "./names";
import type { Rng } from "./rng";
import type { Ctx } from "./state";
import type { CareerStage, PersonKind, PersonRow, PersonStateRow, Traits } from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Nomes em uso no mundo, montados uma vez por cálculo (refeitos se alguém entrou ou saiu por outro caminho). */
const NAMES = new WeakMap<Ctx, { size: number; names: Set<string> }>();
export function namesInUse(ctx: Ctx): Set<string> {
  let c = NAMES.get(ctx);
  if (!c || c.size !== ctx.t.persons.size) {
    c = { size: ctx.t.persons.size, names: new Set([...ctx.t.persons.values()].map((p) => p.name)) };
    NAMES.set(ctx, c);
  }
  return c.names;
}

/** Nome novo e único para uma pessoa que vai entrar no mundo agora (fica reservado). */
export function newPersonName(ctx: Ctx, rng: Rng): string {
  const names = namesInUse(ctx);
  const name = freshName(rng, names);
  names.add(name);
  NAMES.get(ctx)!.size += 1;
  return name;
}

/**
 * Desfaz nomes repetidos entre pessoas fictícias. Um bug antigo dava o mesmo nome (e a mesma
 * idade e profissão) a vários eleitos sem nome de um partido na mesma disputa de deputado ou
 * vereador. Quem chegou primeiro fica; os outros ganham um sobrenome do meio, também nos
 * resultados gravados e nas chapas. Pessoas reais e jogadores não mudam.
 */
export function dedupeNames(ctx: Ctx): number {
  const byName = new Map<string, PersonRow[]>();
  for (const p of ctx.t.persons.values()) {
    const list = byName.get(p.name);
    if (list) list.push(p);
    else byName.set(p.name, [p]);
  }
  const taken = new Set(byName.keys());
  const renamed = new Map<string, string>();
  for (const [name, list] of byName) {
    if (list.length < 2) continue;
    const fictional = list.filter((p) => p.kind === "FICTIONAL_GENERATED");
    // com uma pessoa real ou um jogador de mesmo nome, todos os fictícios mudam; senão, fica o primeiro
    const change = fictional.length === list.length ? fictional.slice(1) : fictional;
    for (const p of change) {
      const next = distinctName(name, taken, ctx.rng("nomes", p.id));
      taken.add(next);
      p.name = next;
      ctx.save("persons", p);
      renamed.set(p.id, next);
    }
  }
  if (!renamed.size) return 0;
  for (const r of ctx.t.races.values()) {
    let dirty = false;
    for (const res of [r.results.first, r.results.runoff]) {
      for (const c of res?.candidates ?? []) {
        const next = renamed.get(c.person_id);
        if (next && c.name !== next) {
          c.name = next;
          dirty = true;
        }
      }
    }
    if (dirty) ctx.save("races", r);
  }
  for (const c of ctx.t.candidacies.values()) {
    const vice = c.campaign.vice;
    const sup = c.campaign.suplentes ?? [];
    const hit = (vice && renamed.has(vice.id)) || sup.some((s) => renamed.has(s.id));
    if (!hit) continue;
    if (vice && renamed.has(vice.id)) c.campaign.vice = { ...vice, name: renamed.get(vice.id)! };
    if (sup.length) c.campaign.suplentes = sup.map((s) => (renamed.has(s.id) ? { ...s, name: renamed.get(s.id)! } : s));
    ctx.save("candidacies", c);
  }
  NAMES.delete(ctx);
  return renamed.size;
}

export function randomTraits(rng: Rng, base: Partial<Traits> = {}): Traits {
  return {
    ambition: clamp01(base.ambition ?? rng.range(0.3, 0.95)),
    loyalty: clamp01(base.loyalty ?? rng.range(0.2, 0.9)),
    riskTolerance: clamp01(base.riskTolerance ?? rng.range(0.1, 0.9)),
    competence: clamp01(base.competence ?? rng.range(0.3, 0.9)),
    charisma: clamp01(base.charisma ?? rng.range(0.25, 0.9)),
  };
}

/**
 * Traços de pessoas reais: neutros e ocultos. O jogo não atribui a uma pessoa
 * real uma personalidade inventada (ex.: "pouco leal", "propenso a risco");
 * todos recebem valores medianos, com risco mínimo (nunca entram em esquemas).
 */
export function neutralRealTraits(rng: Rng): Traits {
  return {
    ambition: 0.6 + rng.range(-0.05, 0.05),
    loyalty: 0.6,
    riskTolerance: 0,
    competence: 0.6,
    charisma: 0.6,
  };
}

export interface NewPersonInput {
  id: string;
  kind: PersonKind;
  name: string;
  birthYear: number;
  uf: string;
  municipality: string;
  profession: string;
  origin: string;
  partyId: string | null;
  ideology: Ideology;
  stage: CareerStage;
  reputation: number;
  visibility: number;
  traits: Traits;
  money: number;
  /** bens declarados (imóveis, veículos); padrão: o dobro do dinheiro em caixa */
  assets?: number;
  reach?: Record<string, number>;
  tier: number;
  roleLabel?: string | null;
  externalRef?: string | null;
  sourceId?: string | null;
  realPartyLabel?: string | null;
  userId?: string | null;
  filiationDate?: string | null;
  domicileSince: string;
  createdTick: number;
  worldId: string;
}

export function buildPerson(input: NewPersonInput): { person: PersonRow; state: PersonStateRow } {
  const person: PersonRow = {
    id: input.id,
    world_id: input.worldId,
    kind: input.kind,
    user_id: input.userId ?? null,
    name: input.name,
    birth_year: input.birthYear,
    uf: input.uf,
    municipality: input.municipality,
    profession: input.profession,
    origin: input.origin,
    party_id: input.partyId,
    faction_id: null,
    stage: input.stage,
    reputation: input.reputation,
    visibility: input.visibility,
    ideology: input.ideology,
    status: "ACTIVE",
    status_note: null,
    office_code: null,
    office_geo: null,
    real_party_label: input.realPartyLabel ?? null,
    source_id: input.sourceId ?? null,
    external_ref: input.externalRef ?? null,
    tier: input.tier,
    role_label: input.roleLabel ?? null,
    created_tick: input.createdTick,
  };
  return { person, state: buildPersonState(input) };
}

/** Ficha interna (person_state) de quem nasce no mundo: a mesma forma para todo tipo de pessoa. */
export function buildPersonState(
  input: Pick<NewPersonInput, "id" | "worldId" | "userId" | "traits" | "money" | "assets" | "reach" | "partyId" | "filiationDate" | "domicileSince">,
): PersonStateRow {
  return {
    id: input.id,
    world_id: input.worldId,
    user_id: input.userId ?? null,
    traits: input.traits,
    money: input.money,
    energy: 100,
    political_capital: 20,
    party_standing: input.partyId ? 40 : 0,
    debate_prep: 20,
    scandal: 0,
    reach: input.reach ?? {},
    action_log: {},
    offers: [],
    interests: [],
    domicile_since: input.domicileSince,
    filiation_date: input.filiationDate ?? null,
    ineligible_until: null,
    activism: 0,
    income_last_year: 0,
    last_action_tick: 0,
    action_seq: 0,
    dossiers: {},
    findings: {},
    dirty_money: 0,
    debt: 0,
    assets: input.assets ?? Math.round(input.money * 2),
    ledger: { month: null, items: [], net: 0 },
    achievements: {},
    jailed_until: null,
    sentence: null,
    story: null,
  };
}

/**
 * A ficha interna da pessoa, criada na hora se faltar. Personagens ativos ficaram sem ela quando a
 * gravação de um dia foi cortada no meio (incidente de 18 e 19/11): a pessoa foi gravada e a ficha
 * não. Sem ela, a troca de partido na janela partidária quebrava e o dia do calendário eleitoral
 * era pulado. A ficha nova sai do sorteio da própria pessoa (pessoa real: traços neutros, sem
 * dinheiro, como no ponto de partida).
 */
export function ensureState(ctx: Ctx, p: PersonRow): PersonStateRow {
  const had = ctx.pstate(p.id);
  if (had) return had;
  const rng = ctx.rng("ficha", p.id);
  const real = p.kind === "REAL_HISTORICAL" || p.kind === "REAL_ACTIVE_AT_SNAPSHOT";
  const st = buildPersonState({
    id: p.id,
    worldId: p.world_id,
    userId: p.user_id,
    traits: real ? neutralRealTraits(rng) : randomTraits(rng),
    money: real ? 0 : rng.int(20_000, 400_000),
    reach: p.uf ? { [p.uf]: p.office_code ? 0.15 : 0.05 } : {},
    partyId: p.party_id,
    filiationDate: p.party_id ? "2000-01-01" : null,
    domicileSince: "2000-01-01",
  });
  ctx.save("person_states", st);
  return st;
}

/**
 * Cria um quadro procedural (FICTIONAL_GENERATED) filiado a um partido.
 * É assim que o mundo se renova até 2100 sem inventar biografias de pessoas reais.
 */
export function spawnProceduralCadre(
  ctx: Ctx,
  opts: { partyId: string; uf: string; municipality?: string; ideology: Ideology; roleLabel: string; ageRange?: [number, number]; reputation?: number; tier?: number },
): PersonRow {
  // sorteio próprio de cada pessoa: com a mesma semente, os eleitos sem nome de um partido na
  // mesma disputa saíam iguais (nome, idade e profissão)
  const id = ctx.id("per", opts.partyId, opts.municipality || opts.uf);
  const rng = ctx.rng("spawn", `${id}:${opts.roleLabel}`);
  const [minAge, maxAge] = opts.ageRange ?? [28, 55];
  const age = rng.int(minAge, maxAge);
  const birthYear = Number(ctx.date.slice(0, 4)) - age;
  const prof = rng.pick(PROFESSIONS);
  const name = newPersonName(ctx, rng);
  const { person, state } = buildPerson({
    id,
    kind: "FICTIONAL_GENERATED",
    name,
    birthYear,
    uf: opts.uf,
    municipality: opts.municipality ?? "",
    profession: prof.label,
    origin: "procedural",
    partyId: opts.partyId,
    ideology: jitter(opts.ideology, rng, 12),
    stage: "QUADRO",
    reputation: opts.reputation ?? rng.int(30, 55),
    visibility: rng.int(5, 25),
    traits: randomTraits(rng),
    money: rng.int(20_000, 400_000),
    reach: { [opts.uf]: rng.range(0.03, 0.15) },
    tier: opts.tier ?? 3,
    roleLabel: opts.roleLabel,
    filiationDate: ctx.date,
    domicileSince: "2000-01-01",
    createdTick: ctx.tick,
    worldId: ctx.world.id,
  });
  ctx.save("persons", person);
  ctx.save("person_states", state);
  return person;
}

export function personAge(p: PersonRow, date: string): number {
  return ageAt(p.birth_year, date);
}
