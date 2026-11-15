import { diffDays, type ISODate } from "./calendar";
import { geoName } from "./elections";
import { canonicalGeo } from "./geo";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { WorldState } from "./state";
import { BALLOT_DIGITS } from "./ticket";
import type { CandidacyRow, ElectionRow, RaceRow } from "./types";

/**
 * Urna simbólica (sugestão do jogador Rian Andrade): no dia da votação o jogador vota, como
 * eleitor, nos cargos da cédula do estado ou da cidade onde mora, inclusive em si mesmo. O voto
 * não entra na contagem do jogo; a tela guarda a escolha só no aparelho, para marcar "seu voto"
 * na apuração.
 */

export interface UrnaCandidate {
  /** candidatura */
  id: string;
  person: string;
  number: number;
  name: string;
  party: string;
  /** vice ou suplentes da chapa, quando escolhidos */
  mates?: Array<{ label: string; name: string }>;
  me: boolean;
  /** foto (pessoa real) ou avatar (jogador), preenchidos pelo site */
  photo?: string | null;
  avatar?: string | null;
}

export interface UrnaParty {
  id: string;
  number: number;
  acronym: string;
  name: string;
}

export interface UrnaOffice {
  /** disputa e, quando o Senado elege dois, a vaga */
  key: string;
  race: string;
  office: OfficeCode;
  title: string;
  vaga?: 1 | 2;
  digits: number;
  proportional: boolean;
  candidates: UrnaCandidate[];
  /** legendas que valem nos cargos proporcionais (os 2 números do partido) */
  parties: UrnaParty[];
}

export interface Urna {
  key: string;
  world: string;
  election: string;
  year: number;
  round: 1 | 2;
  date: ISODate;
  /** estado (gerais) ou cidade (municipais) onde o jogador vota */
  place: string;
  offices: UrnaOffice[];
}

/** Ordem dos cargos na urna de verdade. */
const ORDER: Record<string, OfficeCode[]> = {
  GERAL: ["DEP_FEDERAL", "DEP_ESTADUAL", "SENADOR", "GOVERNADOR", "PRESIDENTE"],
  MUNICIPAL: ["VEREADOR", "PREFEITO"],
};

const TITLE: Record<OfficeCode, string> = {
  DEP_FEDERAL: "Deputado(a) federal",
  DEP_ESTADUAL: "Deputado(a) estadual",
  SENADOR: "Senador(a)",
  GOVERNADOR: "Governador(a)",
  PRESIDENTE: "Presidente",
  VEREADOR: "Vereador(a)",
  PREFEITO: "Prefeito(a)",
};

const MATE: Partial<Record<OfficeCode, string>> = { PREFEITO: "Vice-prefeito(a)", GOVERNADOR: "Vice-governador(a)", PRESIDENTE: "Vice-presidente" };

/** Dias antes da votação em que a urna já abre (no mundo compartilhado, a véspera é o último dia vivido da rodada). */
export const URNA_DAYS = 7;

const OUT = new Set(["PRE", "DESISTENTE", "INDEFERIDA"]);

/**
 * Quem está na cédula da disputa naquele turno. Serve antes e depois da contagem: depois dela, a
 * lista sai do resultado gravado (as candidaturas já mudaram de situação).
 */
function runners(state: WorldState, race: RaceRow, round: 1 | 2): CandidacyRow[] {
  const proportional = OFFICES[race.office_code].system === "PROPORCIONAL";
  const own = () => [...state.t.candidacies.values()].filter((c) => c.race_id === race.id);
  const fromResult = (ids: string[]) => ids.map((id) => state.t.candidacies.get(id)).filter((c): c is CandidacyRow => !!c);
  if (round === 2) {
    if (proportional) return [];
    const res = race.results.runoff?.candidates;
    return res?.length ? fromResult(res.map((r) => r.candidacy_id)) : own().filter((c) => c.status === "SEGUNDO_TURNO");
  }
  // proporcionais: só quem tem candidatura própria (os jogadores); os demais nomes saem da lista do partido
  if (proportional) return own().filter((c) => !OUT.has(c.status));
  const res = race.results.first?.candidates;
  return res?.length ? fromResult(res.map((r) => r.candidacy_id)) : own().filter((c) => c.status === "HOMOLOGADA");
}

/** A cédula do jogador num turno: cargos do estado ou da cidade onde mora, na ordem da urna. */
export function ballotOf(state: WorldState, personId: string, e: ElectionRow, round: 1 | 2): Urna | null {
  const me = state.t.persons.get(personId);
  if (!me || me.status !== "ACTIVE") return null;
  const uf = me.uf;
  const city = canonicalGeo(me.municipality);
  const parties = [...state.t.parties.values()]
    .filter((p) => p.status === "ATIVO")
    .map((p) => ({ id: p.id, number: p.number, acronym: p.acronym, name: p.name }))
    .sort((a, b) => a.number - b.number);
  const offices: UrnaOffice[] = [];
  for (const office of (ORDER[e.kind] ?? []).filter((o) => round === 1 || OFFICES[o].runoff)) {
    const rule = OFFICES[office];
    const geo = rule.scope === "BR" ? "BR" : rule.scope === "UF" ? uf : city;
    const race = state.t.races.get(`${e.id}:${office}:${geo}`);
    if (!race) continue;
    if (round === 2 && !race.results.runoff && race.status !== "SEGUNDO_TURNO") continue;
    const proportional = rule.system === "PROPORCIONAL";
    const candidates = runners(state, race, round).map((c): UrnaCandidate => {
      const party = state.t.parties.get(c.party_id);
      const vice = c.campaign.vice;
      const sup = c.campaign.suplentes ?? [];
      const mates = vice ? [{ label: MATE[office] ?? "Vice", name: vice.name }] : sup.length ? sup.map((s, i) => ({ label: `${i + 1}º suplente`, name: s.name })) : undefined;
      return { id: c.id, person: c.person_id, number: c.ballot_number, name: state.t.persons.get(c.person_id)?.name ?? "?", party: party?.acronym ?? "", mates, me: c.person_id === personId };
    });
    if (!proportional && !candidates.length) continue;
    candidates.sort((a, b) => Number(b.me) - Number(a.me) || a.number - b.number);
    const title = office === "DEP_ESTADUAL" && uf === "DF" ? "Deputado(a) distrital" : TITLE[office];
    const seats = office === "SENADOR" && round === 1 ? Math.min(2, Math.max(1, race.seats)) : 1;
    for (let v = 1; v <= seats; v++) {
      offices.push({
        key: seats > 1 ? `${race.id}#${v}` : race.id,
        race: race.id,
        office,
        title: seats > 1 ? `${title} · ${v}ª vaga` : title,
        vaga: seats > 1 ? (v as 1 | 2) : undefined,
        digits: BALLOT_DIGITS[office],
        proportional,
        candidates,
        parties: proportional ? parties : [],
      });
    }
  }
  if (!offices.length) return null;
  return {
    key: `${state.world.id}:${e.id}:${round}`,
    world: state.world.id,
    election: e.id,
    year: e.year,
    round,
    date: round === 2 ? e.runoff : e.first_round,
    place: geoName(e.kind === "MUNICIPAL" ? city : uf, { cities: state.cities }),
    offices,
  };
}

/** Urna aberta: a próxima votação ainda não contada, a até URNA_DAYS dias. */
export function openUrna(state: WorldState, personId: string, today: ISODate): Urna | null {
  const open = [...state.t.elections.values()].sort((a, b) => a.first_round.localeCompare(b.first_round));
  for (const e of open) {
    const round: 1 | 2 | null = e.status === "CAMPANHA" ? 1 : e.status === "SEGUNDO_TURNO" ? 2 : null;
    if (!round) continue;
    const left = diffDays(round === 2 ? e.runoff : e.first_round, today);
    if (left < 0 || left > URNA_DAYS) continue;
    const u = ballotOf(state, personId, e, round);
    if (u) return u;
  }
  return null;
}

/** As urnas dos dias de votação que caíram no período (from, to], para votar antes da apuração. */
export function urnasBetween(state: WorldState, personId: string, from: ISODate, to: ISODate): Urna[] {
  const out: Urna[] = [];
  for (const e of state.t.elections.values()) {
    for (const round of [1, 2] as const) {
      const d = round === 2 ? e.runoff : e.first_round;
      if (!(d > from && d <= to)) continue;
      const u = ballotOf(state, personId, e, round);
      if (u) out.push(u);
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
