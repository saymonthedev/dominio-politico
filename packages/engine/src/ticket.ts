import { canonicalGeo } from "./geo";
import { ideologyDistance } from "./ideology";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { CandidacyRow, PartyRow, PersonRow } from "./types";

/**
 * Chapa da candidatura (sugestão do jogador Gabriel do Valle): número de urna no formato da
 * Justiça Eleitoral, vice (prefeito, governador e presidente), dois suplentes (senador) e coligação
 * de até 5 partidos nas disputas majoritárias. Tudo fica no estado da campanha
 * (candidacies.campaign), sem tabela nova.
 */

/** Dígitos do número de urna: os 2 do partido e mais os do candidato. */
export const BALLOT_DIGITS: Record<OfficeCode, number> = { PRESIDENTE: 2, GOVERNADOR: 2, PREFEITO: 2, SENADOR: 3, DEP_FEDERAL: 4, DEP_ESTADUAL: 5, VEREADOR: 5 };
/** Partidos numa coligação, contando o do candidato. */
export const MAX_COALITION = 5;
/** Cargos com vice na chapa. */
export const WITH_VICE: readonly OfficeCode[] = ["PREFEITO", "GOVERNADOR", "PRESIDENTE"];

const LIVE = ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Candidatura viva do jogador (pré-candidatura, registrada ou no 2º turno), numa eleição ainda aberta. */
function ticketCandidacy(ctx: Ctx, personId: string): CandidacyRow | undefined {
  return [...ctx.t.candidacies.values()].find((c) => c.person_id === personId && LIVE.includes(c.status) && ctx.t.elections.get(c.election_id)?.status !== "ENCERRADA");
}

/** Números do partido já usados na disputa por outra candidatura. */
function usedNumbers(ctx: Ctx, raceId: string, partyId: string, selfId?: string): Set<number> {
  return new Set([...ctx.t.candidacies.values()].filter((c) => c.race_id === raceId && c.party_id === partyId && c.id !== selfId && LIVE.includes(c.status)).map((c) => c.ballot_number));
}

/**
 * Número de urna livre na disputa: prefeito, governador e presidente usam o número do partido (22);
 * senador, mais 1 dígito (222); deputado federal, mais 2 (2200); deputado estadual e vereador, mais 3
 * (22007). Sem preferência, os dígitos do candidato saem do id (estáveis).
 */
export function ballotNumber(ctx: Ctx, party: PartyRow, office: OfficeCode, raceId: string, seed: string, opts: { preferred?: number; selfId?: string } = {}): number {
  const extra = BALLOT_DIGITS[office] - 2;
  if (extra <= 0) return party.number;
  const span = 10 ** extra;
  const used = usedNumbers(ctx, raceId, party.id, opts.selfId);
  const start = opts.preferred !== undefined ? ((opts.preferred % span) + span) % span : hash(seed) % span;
  for (let i = 0; i < span; i++) {
    const n = party.number * span + ((start + i) % span);
    if (!used.has(n)) return n;
  }
  return party.number * span + start;
}

/** Finais fáceis de lembrar, oferecidos primeiro na escolha do número. */
const NICE = [0, 1, 10, 11, 12, 13, 20, 22, 23, 33, 44, 50, 55, 66, 77, 88, 99, 100, 111, 123, 200, 222, 300, 321, 333, 400, 444, 500, 555, 600, 666, 700, 777, 800, 888, 900, 999];

/** Números que o candidato pode escolher (o atual e os livres fáceis de lembrar). */
export function ballotChoices(ctx: Ctx, c: CandidacyRow): Array<{ value: string; label: string }> {
  const party = ctx.t.parties.get(c.party_id);
  const extra = BALLOT_DIGITS[c.office_code] - 2;
  if (!party || extra <= 0) return [];
  const span = 10 ** extra;
  const used = usedNumbers(ctx, c.race_id, party.id, c.id);
  const finals = extra === 1 ? Array.from({ length: 10 }, (_, i) => i) : NICE.filter((x) => x < span);
  const list = [c.ballot_number, ...finals.map((f) => party.number * span + f)].filter((n, i, all) => all.indexOf(n) === i && (n === c.ballot_number || !used.has(n)));
  return list.map((n) => ({ value: String(n), label: n === c.ballot_number ? `${n} (o seu agora)` : String(n) }));
}

/** Partidos da coligação, com o do candidato primeiro. */
export function coalitionOf(c: CandidacyRow): string[] {
  return [c.party_id, ...(c.campaign.coalition ?? [])];
}

/** Afinidade entre dois partidos (1 = mesma linha, 0 = opostos). */
export function partyFit(a: PartyRow, b: PartyRow): number {
  return 1 - ideologyDistance(a.ideology, b.ideology);
}

/** O partido topa entrar? Afinidade alta basta; afinidade média pede peso para negociar. */
export function coalitionAccepts(fit: number, capital: number, reputation: number): boolean {
  return fit >= 0.7 || (fit >= 0.55 && capital + reputation / 2 >= 45);
}

/**
 * Partidos que podem entrar na coligação: ativos, fora dela, sem candidato próprio na disputa e sem
 * estar na coligação de outro candidato da mesma disputa. Os mais afins primeiro.
 */
export function coalitionChoices(ctx: Ctx, c: CandidacyRow): Array<{ party: PartyRow; fit: number }> {
  const own = ctx.t.parties.get(c.party_id);
  if (!own) return [];
  const inside = new Set(coalitionOf(c));
  const taken = new Set<string>();
  for (const x of ctx.t.candidacies.values()) {
    if (x.race_id !== c.race_id || x.id === c.id || !LIVE.includes(x.status)) continue;
    taken.add(x.party_id);
    for (const id of x.campaign.coalition ?? []) taken.add(id);
  }
  return [...ctx.t.parties.values()]
    .filter((x) => x.status === "ATIVO" && !inside.has(x.id) && !taken.has(x.id))
    .map((x) => ({ party: x, fit: partyFit(own, x) }))
    .sort((a, b) => b.fit - a.fit || a.party.acronym.localeCompare(b.party.acronym));
}

/** Rótulo da afinidade para a escolha do partido. */
export function fitLabel(fit: number): string {
  return fit >= 0.7 ? "afinidade alta" : fit >= 0.55 ? "afinidade média: precisa de peso para negociar" : "afinidade baixa: não deve topar";
}

/**
 * Nomes para vice ou suplente: filiados fictícios dos partidos da coligação, com a idade mínima do
 * cargo, domicílio na disputa e sem candidatura própria nesta eleição. Pessoas reais não entram em
 * chapa de jogador.
 */
export function runningMateChoices(ctx: Ctx, me: PersonRow, c: CandidacyRow): PersonRow[] {
  const parties = new Set(coalitionOf(c));
  const year = Number(ctx.date.slice(0, 4));
  const minAge = OFFICES[c.office_code].minAge;
  const running = new Set([...ctx.t.candidacies.values()].filter((x) => x.election_id === c.election_id && LIVE.includes(x.status)).map((x) => x.person_id));
  const here = (x: PersonRow) => (c.geo === "BR" ? true : c.geo.length === 2 ? x.uf === c.geo : canonicalGeo(x.municipality) === c.geo);
  return [...ctx.t.persons.values()]
    .filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && x.id !== me.id && !!x.party_id && parties.has(x.party_id) && year - x.birth_year >= minAge && !running.has(x.id) && here(x))
    .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
    .slice(0, 40);
}

/** Opções das escolhas da chapa para a tela (o jogador precisa de candidatura viva). */
export function ticketParamOptions(ctx: Ctx, me: PersonRow, type: string): Array<{ value: string; label: string }> | undefined {
  if (type !== "coalition_party" && type !== "running_mate" && type !== "ballot_number") return undefined;
  const c = ticketCandidacy(ctx, me.id);
  if (!c) return [];
  if (type === "coalition_party") return coalitionChoices(ctx, c).map(({ party, fit }) => ({ value: party.id, label: `${party.acronym}: ${fitLabel(fit)}` }));
  if (type === "ballot_number") return ballotChoices(ctx, c);
  const year = Number(ctx.date.slice(0, 4));
  return [
    { value: "novo", label: "Um nome novo do seu partido" },
    ...runningMateChoices(ctx, me, c).map((x) => ({
      value: x.id,
      label: `${x.name} (${ctx.t.parties.get(x.party_id!)?.acronym ?? "sem partido"}) · ${year - x.birth_year} anos · reputação ${Math.round(x.reputation)}`,
    })),
  ];
}
