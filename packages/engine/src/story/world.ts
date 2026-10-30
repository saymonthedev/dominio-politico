import { relKey } from "../affiliation";
import { ageAt } from "../calendar";
import { cityName } from "../cities";
import { canonicalGeo, capitalId, isMunicipality, UF_BY_CODE } from "../geo";
import { jitter, makeIdeology, type Ideology } from "../ideology";
import { generateName, PROFESSIONS } from "../names";
import { isReal } from "../news/policy";
import { buildPerson, randomTraits } from "../npc";
import type { Rng } from "../rng";
import type { Ctx } from "../state";
import type { PartyRow, PersonRow } from "../types";

/**
 * Quem aparece nas histórias. Regra: só personagens fictícios (procedurais)
 * fazem coisas nos eventos. Pessoas reais nunca recebem falas, ofertas,
 * ataques ou atitudes inventadas; outros jogadores também não (são pessoas
 * de verdade jogando).
 */
export function canAct(p: PersonRow | undefined): p is PersonRow {
  return !!p && p.status === "ACTIVE" && p.kind === "FICTIONAL_GENERATED";
}

export function cityOf(p: PersonRow): string {
  const g = canonicalGeo(p.municipality);
  return isMunicipality(g) ? g : capitalId(p.uf);
}

export function cityLabel(ctx: Ctx, p: PersonRow): string {
  return cityName(ctx.s, cityOf(p)) ?? UF_BY_CODE[p.uf]?.capital ?? p.uf;
}

const BAIRRO_A = ["Jardim", "Vila", "Parque", "Conjunto", "Residencial", "Bairro"];
const BAIRRO_B = [
  "das Flores", "Esperança", "São José", "Santa Rita", "Primavera", "dos Ipês", "Boa Vista", "Alvorada", "Bela Vista", "do Sol",
  "Novo Horizonte", "Santa Luzia", "São Francisco", "das Palmeiras", "Industrial", "Monte Alegre", "Vista Verde", "Liberdade", "Aeroporto", "Cruzeiro",
];

/** Nome de bairro fictício e estável para uma chave. */
export function neighborhood(rng: Rng): string {
  return `${rng.pick(BAIRRO_A)} ${rng.pick(BAIRRO_B)}`;
}

const COMPANY_A = ["Construtora", "Grupo", "Transportes", "Comercial", "Agropecuária", "Rede de Supermercados", "Incorporadora", "Laboratórios"];
const COMPANY_B = ["Aliança", "Horizonte", "Serra Azul", "Boa Safra", "Ipê Dourado", "Rio Claro", "Vale Verde", "Atlântica", "Pinheiral", "Três Marias", "Bandeirante", "Cruzeiro do Sul"];

export function companyName(rng: Rng): string {
  return `${rng.pick(COMPANY_A)} ${rng.pick(COMPANY_B)}`;
}

const RADIOS = ["Rádio Comunitária Voz do Povo", "Rádio Cidade", "Rádio Nova Era", "Rádio Alvorada", "TV Local Canal 8"];
export function localOutlet(rng: Rng): string {
  return rng.pick(RADIOS);
}

/** Relação entre duas pessoas (-100..100). */
export function rel(ctx: Ctx, a: string, b: string): number {
  return ctx.t.relationships.get(relKey(a, b))?.score ?? 0;
}

/** Contatos do personagem (relação mínima), só pessoas que podem agir nas histórias. */
export function contactsOf(ctx: Ctx, p: PersonRow, min = 15): Array<{ person: PersonRow; score: number }> {
  const out: Array<{ person: PersonRow; score: number }> = [];
  for (const r of ctx.t.relationships.values()) {
    if (r.a_id !== p.id || r.score < min) continue;
    const other = ctx.person(r.b_id);
    if (canAct(other)) out.push({ person: other, score: r.score });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Políticos e dirigentes fictícios da cidade (ou da UF, se a cidade não tiver nenhum). */
export function localPoliticians(ctx: Ctx, p: PersonRow, partyId?: string | null): PersonRow[] {
  const city = cityOf(p);
  const all = [...ctx.t.persons.values()].filter((x) => canAct(x) && x.uf === p.uf && x.party_id && (partyId ? x.party_id === partyId : true));
  const inCity = all.filter((x) => canonicalGeo(x.municipality) === city);
  return inCity.length ? inCity : all.filter((x) => x.tier >= 2);
}

/** Gente do partido na UF, com quem já há relação primeiro. */
export function partyPeople(ctx: Ctx, p: PersonRow, party: PartyRow): PersonRow[] {
  return [...ctx.t.persons.values()]
    .filter((x) => canAct(x) && x.party_id === party.id && x.uf === p.uf)
    .sort((a, b) => rel(ctx, p.id, b.id) - rel(ctx, p.id, a.id) || b.reputation - a.reputation);
}

/** Dirigente do partido na UF (cria um quadro procedural se o partido não tiver ninguém fictício ali). */
export function partyLeader(ctx: Ctx, p: PersonRow, party: PartyRow): PersonRow {
  const people = partyPeople(ctx, p, party);
  const leader = people.find((x) => /dirigente|presid/i.test(x.role_label ?? "")) ?? people[0];
  if (leader) return leader;
  return findFigure(ctx, p, `dirigente:${party.id}`, `dirigente municipal do ${party.acronym}`, { partyId: party.id, ideology: party.ideology, age: [38, 64], reputation: 45 });
}

/**
 * Figura recorrente das histórias (liderança comunitária, empresário,
 * jornalista, dirigente): reaproveita a mesma pessoa na mesma cidade, para
 * as histórias se encontrarem; cria uma nova quando ainda não existe.
 */
export function findFigure(
  ctx: Ctx,
  p: PersonRow,
  roleKey: string,
  roleLabel: string,
  opts: { partyId?: string | null; ideology?: Ideology; age?: [number, number]; reputation?: number; fresh?: boolean } = {},
): PersonRow {
  const city = cityOf(p);
  const ref = `story:${roleKey}:${city}`;
  if (!opts.fresh) {
    const existing = [...ctx.t.persons.values()].find((x) => x.external_ref === ref && x.status === "ACTIVE");
    if (existing) return existing;
  }
  return spawnFigure(ctx, { ref: opts.fresh ? `${ref}:${ctx.tick}` : ref, roleLabel, uf: p.uf, municipality: city, partyId: opts.partyId ?? null, ideology: opts.ideology, age: opts.age, reputation: opts.reputation });
}

export function spawnFigure(
  ctx: Ctx,
  o: { ref: string; roleLabel: string; uf: string; municipality: string; partyId?: string | null; ideology?: Ideology; age?: [number, number]; reputation?: number },
): PersonRow {
  const rng = ctx.rng("story-figure", o.ref);
  const [a, b] = o.age ?? [30, 60];
  const age = rng.int(a, b);
  let name = generateName(rng);
  const taken = new Set([...ctx.t.persons.values()].map((x) => x.name));
  for (let i = 0; i < 6 && taken.has(name); i++) name = generateName(rng);
  const { person, state } = buildPerson({
    id: ctx.id("per", "story", o.ref),
    kind: "FICTIONAL_GENERATED",
    name,
    birthYear: Number(ctx.date.slice(0, 4)) - age,
    uf: o.uf,
    municipality: o.municipality,
    profession: rng.pick(PROFESSIONS).label,
    origin: "story",
    partyId: o.partyId ?? null,
    ideology: jitter(o.ideology ?? makeIdeology(), rng, 18),
    stage: o.partyId ? "QUADRO" : "ATIVISTA",
    reputation: o.reputation ?? rng.int(35, 60),
    visibility: rng.int(4, 18),
    traits: randomTraits(rng),
    money: rng.int(15_000, 300_000),
    reach: { [o.uf]: rng.range(0.02, 0.08) },
    tier: 3,
    roleLabel: o.roleLabel,
    externalRef: o.ref,
    filiationDate: o.partyId ? ctx.date : null,
    domicileSince: "2000-01-01",
    createdTick: ctx.tick,
    worldId: ctx.world.id,
  });
  ctx.save("persons", person);
  ctx.save("person_states", state);
  return person;
}

/** Nome com o papel entre parênteses, para os textos. */
export function who(p: PersonRow): string {
  return p.role_label ? `${p.name} (${p.role_label})` : p.name;
}

export function firstName(p: PersonRow): string {
  return p.name.split(" ")[0];
}

/** Pessoa real só pode ser citada de forma neutra e factual; nunca como autora de atitudes inventadas. */
export function realPerson(p: PersonRow | undefined): boolean {
  return !!p && isReal(p.kind);
}

export function ageOf(p: PersonRow, date: string): number {
  return ageAt(p.birth_year, date);
}
