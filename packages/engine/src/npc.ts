import { ageAt } from "./calendar";
import { jitter, type Ideology } from "./ideology";
import { generateName, PROFESSIONS } from "./names";
import type { Rng } from "./rng";
import type { Ctx } from "./state";
import type { CareerStage, PersonKind, PersonRow, PersonStateRow, Traits } from "./types";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

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
  const state: PersonStateRow = {
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
    jailed_until: null,
    sentence: null,
  };
  return { person, state };
}

/**
 * Cria um quadro procedural (FICTIONAL_GENERATED) filiado a um partido.
 * É assim que o mundo se renova até 2100 sem inventar biografias de pessoas reais.
 */
export function spawnProceduralCadre(
  ctx: Ctx,
  opts: { partyId: string; uf: string; municipality?: string; ideology: Ideology; roleLabel: string; ageRange?: [number, number]; reputation?: number; tier?: number },
): PersonRow {
  const rng = ctx.rng("spawn", `${opts.partyId}:${opts.municipality || opts.uf}:${opts.roleLabel}`);
  const [minAge, maxAge] = opts.ageRange ?? [28, 55];
  const age = rng.int(minAge, maxAge);
  const birthYear = Number(ctx.date.slice(0, 4)) - age;
  const prof = rng.pick(PROFESSIONS);
  let name = generateName(rng);
  const taken = new Set([...ctx.t.persons.values()].map((p) => p.name));
  for (let i = 0; i < 5 && taken.has(name); i++) name = generateName(rng);
  const { person, state } = buildPerson({
    id: ctx.id("per", opts.partyId, opts.municipality || opts.uf),
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
