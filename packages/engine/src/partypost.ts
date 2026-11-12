import { ageAt, formatDatePt } from "./calendar";
import { canonicalGeo } from "./geo";
import { isReal } from "./news/policy";
import { homeCityOf } from "./housing";
import { inaugurationDate, OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx, WorldState } from "./state";
import { storyOf } from "./story/state";
import type { MembershipRow, PartyRow, PersonRow, PersonStateRow } from "./types";

/**
 * Cargo do jogador dentro do partido. Quem vence a eleição do diretório municipal
 * passa a presidi-lo; daí dá para disputar o diretório estadual e a executiva
 * nacional. Secretários ajudam a tocar a máquina; presidentes mandam: nomeiam e
 * afastam dirigentes, abrem processo de expulsão, orientam a bancada, negociam
 * alianças e indicam quem o partido lança na cidade (ou no estado).
 */

export type PartyPostLevel = "SECRETARIO" | "PRES_MUNICIPAL" | "PRES_ESTADUAL" | "PRES_NACIONAL";

export interface PartyPost {
  level: PartyPostLevel;
  label: string;
  /** área da secretaria (só secretários) */
  area?: string;
  since?: string;
}

const RANK: Record<PartyPostLevel, number> = { SECRETARIO: 1, PRES_MUNICIPAL: 2, PRES_ESTADUAL: 3, PRES_NACIONAL: 4 };

export function postRank(level: PartyPostLevel | null | undefined): number {
  return level ? RANK[level] : 0;
}

export function activeMembership(s: Pick<WorldState, "t">, personId: string): MembershipRow | undefined {
  return [...s.t.memberships.values()].find((m) => m.person_id === personId && m.status === "ATIVA");
}

/** Cargo atual do jogador no partido (null = filiado sem cargo). */
export function partyPostOf(s: Pick<WorldState, "t">, p: PersonRow, st: PersonStateRow | undefined): PartyPost | null {
  if (!p.party_id) return null;
  const party = s.t.parties.get(p.party_id);
  if (party?.president_id === p.id) return { level: "PRES_NACIONAL", label: `presidente nacional do ${party.acronym}` };
  const m = activeMembership(s, p.id);
  if (!m || m.role === "MEMBRO") return null;
  const flags = st?.story?.flags ?? {};
  const level = (flags.cargo_partido as PartyPostLevel | undefined) ?? (inferLevel(st) ?? "SECRETARIO");
  const acr = party?.acronym ?? "partido";
  const since = typeof flags.cargo_desde === "string" ? flags.cargo_desde : undefined;
  switch (level) {
    case "PRES_ESTADUAL":
      return { level, label: `presidente estadual do ${acr} (${p.uf})`, since };
    case "PRES_MUNICIPAL":
      return { level, label: `presidente do diretório municipal do ${acr}`, since };
    case "PRES_NACIONAL":
      return { level, label: `presidente nacional do ${acr}`, since };
    default:
      return { level: "SECRETARIO", label: `secretário(a)${flags.cargo_area ? ` de ${flags.cargo_area}` : ""} do ${acr}`, area: flags.cargo_area as string | undefined, since };
  }
}

/** Quem venceu a eleição do diretório antes deste sistema existir: o histórico diz. */
function inferLevel(st: PersonStateRow | undefined): PartyPostLevel | null {
  const log = st?.story?.log ?? [];
  if (log.some((e) => e.def === "diretorio_resultado" && e.outcome.startsWith("Zebra!"))) return "PRES_MUNICIPAL";
  return null;
}

export function setPartyPost(ctx: Ctx, p: PersonRow, st: PersonStateRow, level: PartyPostLevel | null, area?: string): void {
  const s = storyOf(st, p, ctx.date);
  const m = activeMembership(ctx.s, p.id);
  if (level === null) {
    delete s.flags.cargo_partido;
    delete s.flags.cargo_area;
    delete s.flags.cargo_desde;
    if (m && m.role !== "MEMBRO") {
      m.role = "MEMBRO";
      ctx.save("memberships", m);
    }
    return;
  }
  s.flags.cargo_partido = level;
  s.flags.cargo_desde = ctx.date;
  if (area) s.flags.cargo_area = area;
  else delete s.flags.cargo_area;
  if (m) {
    m.role = level === "SECRETARIO" ? "DIRIGENTE" : "PRESIDENTE";
    ctx.save("memberships", m);
  }
  // o cargo fica na história do jogador: marcar president_id de um partido real faria o motor tratá-lo
  // como partido de jogador (e sumir com as candidaturas dos quadros fictícios no país inteiro)
}

/** Gente do partido no alcance do cargo: a cidade (municipal), o estado ou o país. */
export function partyMembersInScope(s: Pick<WorldState, "t">, p: PersonRow, level: PartyPostLevel): PersonRow[] {
  if (!p.party_id) return [];
  const city = homeCityOf(p);
  return [...s.t.persons.values()]
    // só personagens do jogo (fictícios ou outros jogadores): pessoas reais nunca são alvo de afastamento ou expulsão
    .filter((x) => x.id !== p.id && x.party_id === p.party_id && x.status === "ACTIVE" && !isReal(x.kind))
    .filter((x) => (level === "PRES_NACIONAL" ? true : level === "PRES_ESTADUAL" ? x.uf === p.uf : x.uf === p.uf && (canonicalGeo(x.municipality) === city || !!x.office_code)))
    .sort((a, b) => Number(!!b.office_code) - Number(!!a.office_code) || b.reputation - a.reputation);
}

/** Dirigentes (com cargo na executiva) dentro do alcance. */
export function partyOfficersInScope(s: Pick<WorldState, "t">, p: PersonRow, level: PartyPostLevel): PersonRow[] {
  const ids = new Set([...s.t.memberships.values()].filter((m) => m.status === "ATIVA" && m.role !== "MEMBRO" && m.party_id === p.party_id).map((m) => m.person_id));
  return partyMembersInScope(s, p, level).filter((x) => ids.has(x.id));
}

/** Presidente que comanda o diretório onde a disputa acontece (para a convenção dar prioridade a quem ele indicar). */
export function directoryPick(ctx: Ctx, party: PartyRow, geo: string): string | null {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE" || p.party_id !== party.id) continue;
    const st = ctx.pstate(p.id);
    const post = partyPostOf(ctx.s, p, st);
    if (!post || post.level === "SECRETARIO") continue;
    const flags = st?.story?.flags ?? {};
    const pick = flags[`indicacao:${geo}`];
    if (typeof pick !== "string") continue;
    const covers = post.level === "PRES_NACIONAL" || (post.level === "PRES_ESTADUAL" && (geo === p.uf || geo.startsWith(p.uf) || ctx.s.cities?.get(geo)?.uf === p.uf)) || (post.level === "PRES_MUNICIPAL" && geo === homeCityOf(p));
    if (covers) return pick;
  }
  return null;
}

/** Cargo que cada presidência de diretório indica: Presidência, governo do estado ou prefeitura. */
export function indicationOffice(level: PartyPostLevel): OfficeCode {
  return level === "PRES_NACIONAL" ? "PRESIDENTE" : level === "PRES_ESTADUAL" ? "GOVERNADOR" : "PREFEITO";
}

const TARGET: Partial<Record<OfficeCode, string>> = { PRESIDENTE: "a Presidência", GOVERNADOR: "o governo do estado", PREFEITO: "a prefeitura" };
const KIND_LABEL = { GERAL: "geral (presidente, governador, senador e deputados)", MUNICIPAL: "municipal (prefeito e vereador)" } as const;

/**
 * Quando a indicação vale: a próxima eleição em que o cargo está em disputa e ainda dá para
 * registrar (até o fim das convenções), o período da pré-candidatura e um aviso se a pessoa não
 * terá a idade mínima na posse (a convenção ignora quem não pode concorrer).
 */
export function indicationNote(ctx: Ctx, level: PartyPostLevel, who: PersonRow, self: boolean): string {
  const office = indicationOffice(level);
  const rule = OFFICES[office];
  const target = TARGET[office] ?? rule.name;
  const upcoming = [...ctx.t.elections.values()].filter((e) => e.status !== "ENCERRADA" && ctx.date <= e.calendar.conventionEnd).sort((a, b) => a.year - b.year);
  const e = upcoming.find((x) => x.kind === rule.election);
  if (!e) {
    const kind = rule.election === "GERAL" ? "geral" : "municipal";
    return self ? `Registre a pré-candidatura quando abrir a pré-campanha da próxima eleição ${kind}, em 1º de janeiro do ano da eleição.` : "A convenção da próxima eleição vai seguir a indicação.";
  }
  const parts: string[] = [];
  // ano de eleição do outro tipo: o cargo não está em disputa agora
  const other = upcoming.find((x) => x.kind !== rule.election && x.year < e.year && ctx.date >= x.calendar.preCampaignStart);
  if (other) parts.push(`A eleição de ${other.year} é ${KIND_LABEL[other.kind]}: ${target} só está em disputa na de ${e.year}.`);
  const age = ageAt(who.birth_year, inaugurationDate(office, e.year));
  if (age < rule.minAge) {
    let year = e.year;
    while (ageAt(who.birth_year, inaugurationDate(office, year)) < rule.minAge) year += 4;
    parts.push(
      `Atenção: na posse de ${e.year + 1}, ${self ? "você terá" : `${who.name} terá`} ${age} anos, e ${rule.name} exige ${rule.minAge}. ` +
        (self
          ? `A primeira eleição em que dá é a de ${year} (a pré-campanha abre em 1º de janeiro de ${year}); a indicação continua valendo até lá.`
          : `Em ${e.year} a convenção vai escolher outro nome; a primeira eleição em que dá é a de ${year}.`),
    );
  } else if (self) {
    parts.push(
      ctx.date >= e.calendar.preCampaignStart
        ? `Registre a pré-candidatura (em Carreira) até ${formatDatePt(e.calendar.conventionEnd)}, fim das convenções de ${e.year}.`
        : `Registre a pré-candidatura (em Carreira) quando a pré-campanha de ${e.year} abrir: de ${formatDatePt(e.calendar.preCampaignStart)} a ${formatDatePt(e.calendar.conventionEnd)}.`,
    );
  } else {
    parts.push(`A convenção de ${e.year} (${formatDatePt(e.calendar.conventionStart)} a ${formatDatePt(e.calendar.conventionEnd)}) vai seguir a indicação.`);
  }
  return parts.join(" ");
}

export function isPresident(level: PartyPostLevel | null | undefined): boolean {
  return !!level && level !== "SECRETARIO";
}

export function postLabel(level: PartyPostLevel): string {
  return { SECRETARIO: "Secretário(a)", PRES_MUNICIPAL: "Presidente municipal", PRES_ESTADUAL: "Presidente estadual", PRES_NACIONAL: "Presidente nacional" }[level];
}
