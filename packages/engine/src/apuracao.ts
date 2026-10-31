import type { ISODate } from "./calendar";
import { geoName } from "./elections";
import { canonicalGeo, capitalId } from "./geo";
import { OFFICES } from "./ruleset";
import type { WorldState } from "./state";
import type { CandidacyRow, RaceRow } from "./types";

/** Uma linha da apuração: um candidato ou, na contagem por partido, uma legenda. */
export interface CountRow {
  id: string;
  name: string;
  party: string;
  color: string;
  votes: number;
  share: number;
  /** é você (ou, na contagem por partido, o seu partido) */
  me: boolean;
  /** resultado final da linha */
  outcome: "ELEITO" | "SEGUNDO_TURNO" | "NAO";
  /** cadeiras conquistadas (contagem por partido) */
  seats?: number;
}

/** Apuração de uma disputa no dia da votação. */
export interface Apuracao {
  key: string;
  date: ISODate;
  title: string;
  round: 1 | 2;
  /** candidatos lado a lado, ou legendas (disputas proporcionais sem a lista de nomes) */
  kind: "CANDIDATOS" | "PARTIDOS";
  majoritarian: boolean;
  valid: number;
  seats: number;
  rows: CountRow[];
  /** a disputa é a do jogador */
  mine: boolean;
  /** o resultado do jogador nesta disputa */
  you?: { votes: number; share: number; outcome: "ELEITO" | "SEGUNDO_TURNO" | "SUPLENTE" | "NAO_ELEITO"; party: string };
}

const OUT = new Set(["PRE", "DESISTENTE", "INDEFERIDA"]);

/**
 * As apurações de um dia de votação que caiu no período (from, to]: a disputa
 * do jogador primeiro e, depois, as principais do dia para ele (Presidência e
 * governo do estado nas gerais; prefeitura da cidade nas municipais).
 */
export function electionNight(state: WorldState, personId: string, from: ISODate, to: ISODate): Apuracao[] {
  const me = state.t.persons.get(personId);
  if (!me) return [];
  const out: Apuracao[] = [];
  for (const e of state.t.elections.values()) {
    const round: 1 | 2 | null = e.first_round > from && e.first_round <= to ? 1 : e.runoff > from && e.runoff <= to ? 2 : null;
    if (!round) continue;
    const races = [...state.t.races.values()].filter((r) => r.election_id === e.id);
    const mine = [...state.t.candidacies.values()].find((c) => c.election_id === e.id && c.person_id === personId && !OUT.has(c.status));
    const city = canonicalGeo(me.municipality);
    const picks: RaceRow[] = [];
    const add = (r: RaceRow | undefined) => {
      if (r && !picks.includes(r)) picks.push(r);
    };
    if (mine) add(races.find((r) => r.id === mine.race_id));
    if (e.kind === "GERAL") {
      add(races.find((r) => r.office_code === "PRESIDENTE"));
      add(races.find((r) => r.office_code === "GOVERNADOR" && r.geo === me.uf));
    } else {
      add(races.find((r) => r.office_code === "PREFEITO" && r.geo === city) ?? races.find((r) => r.office_code === "PREFEITO" && r.geo === capitalId(me.uf)));
    }
    for (const race of picks) {
      const a = countOf(state, race, round, personId, mine && mine.race_id === race.id ? mine : undefined, round === 2 ? e.runoff : e.first_round);
      if (a) out.push(a);
    }
  }
  return out.slice(0, 3);
}

function countOf(state: WorldState, race: RaceRow, round: 1 | 2, personId: string, mine: CandidacyRow | undefined, date: ISODate): Apuracao | null {
  const rule = OFFICES[race.office_code];
  const majoritarian = rule.system === "MAJORITARIO";
  const res = round === 2 ? race.results.runoff : race.results.first;
  if (!res) return null;
  const party = (id: string | null | undefined) => (id ? state.t.parties.get(id) : undefined);
  const elected = new Set(race.results.elected ?? []);
  const title = `${rule.name} · ${race.geo === "BR" ? "Brasil" : geoName(race.geo, { cities: state.cities })}`;
  const you: Apuracao["you"] = mine
    ? {
        votes: Math.round(mine.votes),
        share: mine.vote_share,
        outcome: mine.status === "ELEITO" ? "ELEITO" : mine.status === "SEGUNDO_TURNO" ? "SEGUNDO_TURNO" : mine.status === "SUPLENTE" ? "SUPLENTE" : "NAO_ELEITO",
        party: party(mine.party_id)?.acronym ?? "",
      }
    : undefined;
  const base = { key: `${race.id}:${round}`, date, title, round, majoritarian, valid: Math.round(res.valid), seats: race.seats, mine: !!mine, you };

  if (res.candidates.length) {
    const sorted = [...res.candidates].sort((a, b) => b.votes - a.votes);
    const top = sorted.slice(0, majoritarian ? 6 : 10);
    const meRow = sorted.find((c) => c.person_id === personId);
    if (meRow && !top.includes(meRow)) top.push(meRow);
    return {
      ...base,
      kind: "CANDIDATOS",
      rows: top.map((c) => {
        const cand = state.t.candidacies.get(c.candidacy_id);
        const won = elected.has(c.person_id) || cand?.status === "ELEITO";
        const runoff = majoritarian && round === 1 && (cand?.status === "SEGUNDO_TURNO" || (!!race.results.runoff && race.results.runoff.candidates.some((r) => r.candidacy_id === c.candidacy_id)));
        return {
          id: c.candidacy_id,
          name: c.name,
          party: party(c.party_id)?.acronym ?? "",
          color: party(c.party_id)?.color ?? "#64748b",
          votes: Math.round(c.votes),
          share: c.share,
          me: c.person_id === personId,
          outcome: runoff ? "SEGUNDO_TURNO" : won && !(majoritarian && round === 1 && race.results.runoff) ? "ELEITO" : "NAO",
        } satisfies CountRow;
      }),
    };
  }

  // disputa proporcional sem a lista de nomes: as legendas lado a lado, com as cadeiras
  const parties = [...(res as { parties?: Array<{ party_id: string; votes: number; share: number; seats: number }> }).parties ?? []].sort((a, b) => b.votes - a.votes);
  if (!parties.length) return null;
  const top = parties.slice(0, 8);
  const myParty = mine ? parties.find((p) => p.party_id === mine.party_id) : undefined;
  if (myParty && !top.includes(myParty)) top.push(myParty);
  return {
    ...base,
    kind: "PARTIDOS",
    rows: top.map((p) => ({
      id: p.party_id,
      name: party(p.party_id)?.name ?? party(p.party_id)?.acronym ?? p.party_id,
      party: party(p.party_id)?.acronym ?? "",
      color: party(p.party_id)?.color ?? "#64748b",
      votes: Math.round(p.votes),
      share: p.share,
      me: !!mine && p.party_id === mine.party_id,
      outcome: p.seats > 0 ? "ELEITO" : "NAO",
      seats: p.seats,
    })),
  };
}
