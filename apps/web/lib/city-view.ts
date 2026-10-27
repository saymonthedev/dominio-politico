import { canonicalGeo, cityNow, partyResolver, profileFor, UFS, type CityNow, type WorldState } from "@dp/engine";
import { MAP_OTHERS, MAP_PALETTE } from "./map-colors";
import { START_POINTS } from "./startpoints";

export interface MapParty {
  id: string;
  acronym: string;
  /** cor da sigla */
  color: string;
  /** cor no mapa: distinta para os maiores partidos, neutra para os demais */
  mapColor: string;
  mayors: number;
}


function hue(hex: string): number | null {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 0.12) return null; // cor neutra
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * Os 10 maiores partidos (em prefeituras) ganham cores da paleta: primeiro os
 * pares sigla/cor de tom mais parecido, para que cada partido fique o mais
 * próximo possível da própria cor. Os demais ficam neutros ("outros").
 */
function assignMapColors(parties: MapParty[]): void {
  const top = [...parties].filter((p) => p.mayors > 0).sort((a, b) => b.mayors - a.mayors).slice(0, MAP_PALETTE.length);
  const pairs: Array<{ p: MapParty; c: string; d: number }> = [];
  for (const p of top) {
    const h = hue(p.color);
    for (const c of MAP_PALETTE) {
      const hc = hue(c) ?? 0;
      pairs.push({ p, c, d: h === null ? 180 : Math.min(Math.abs(hc - h), 360 - Math.abs(hc - h)) - p.mayors / 1e6 });
    }
  }
  pairs.sort((a, b) => a.d - b.d);
  const usedColors = new Set<string>();
  const done = new Set<string>();
  for (const { p, c } of pairs) {
    if (done.has(p.id) || usedColors.has(c)) continue;
    p.mapColor = c;
    done.add(p.id);
    usedColors.add(c);
  }
  for (const p of parties) if (!done.has(p.id)) p.mapColor = MAP_OTHERS;
}

/** [ibge, nome, uf, índice do partido do prefeito (-1 sem prefeito), % do vencedor do 2º turno ×10 (-1 sem dado), eleitorado] */
export type MapCity = [string, string, string, number, number, number];

export interface MapPayload {
  year: number;
  parties: MapParty[];
  cities: MapCity[];
  winner: { name: string; party: string; color: string };
  rival: { name: string; party: string; color: string };
  myCity: string | null;
  states: Record<string, { governor: { name: string; party: string; color: string } | null }>;
}

/** Resumo de todas as cidades para colorir o mapa (prefeito atual no mundo e 2º turno real de partida). */
export function mapPayload(state: WorldState, year: number, myCity: string | null): MapPayload {
  const sp = START_POINTS.find((s) => s.year === year)!;
  const resolve = partyResolver(state.t.parties.values());
  const parties: MapParty[] = [];
  const idx = new Map<string, number>();
  const partyIndex = (id: string | null) => {
    if (!id) return -1;
    if (!idx.has(id)) {
      const p = state.t.parties.get(id);
      if (!p) return -1;
      idx.set(id, parties.length);
      parties.push({ id, acronym: p.acronym, color: p.color, mapColor: MAP_OTHERS, mayors: 0 });
    }
    const i = idx.get(id)!;
    parties[i].mayors++;
    return i;
  };
  const cities: MapCity[] = [];
  for (const id of state.cities?.keys() ?? []) {
    const c = cityNow(state, id, { resolve })!;
    const w = c.president[sp.winner] ?? 0;
    const r = c.president[sp.rival] ?? 0;
    cities.push([id, c.name, c.uf, partyIndex(c.mayor?.partyId ?? null), w + r > 0 ? Math.round((w / (w + r)) * 1000) : -1, c.electorate]);
  }
  assignMapColors(parties);
  const states: MapPayload["states"] = {};
  for (const u of UFS) {
    const m = [...state.t.mandates.values()].find((x) => x.office_code === "GOVERNADOR" && x.geo === u.code && x.status === "ATIVO");
    const p = m ? state.t.persons.get(m.person_id) : undefined;
    const party = p?.party_id ? state.t.parties.get(p.party_id) : undefined;
    states[u.code] = { governor: p ? { name: p.name, party: party?.acronym ?? "", color: party?.color ?? "#64748b" } : null };
  }
  return {
    year,
    parties,
    cities,
    winner: { name: sp.winner, party: sp.winnerParty, color: profileFor(sp.winnerParty, year).color },
    rival: { name: sp.rival, party: sp.rivalParty, color: profileFor(sp.rivalParty, year).color },
    myCity: myCity ? canonicalGeo(myCity) : null,
    states,
  };
}

export interface CityDetail {
  id: string;
  name: string;
  uf: string;
  capital: boolean;
  electorate: number;
  mayor: (NonNullable<CityNow["mayor"]> & { color: string; href: string | null }) | null;
  mayorElect: (NonNullable<CityNow["mayorElect"]> & { color: string }) | null;
  replaced: { name: string; party: string; reason: string } | null;
  council: Array<{ partyId: string | null; label: string; color: string; seats: number }>;
  president: Array<{ name: string; votes: number; pct: number; color: string }>;
  players: Array<{ id: string; name: string; party: string | null; stage: string }>;
  locals: Array<{ id: string; name: string; party: string | null; role: string }>;
}

/** Detalhes de uma cidade para o painel do mapa. */
export function cityDetail(state: WorldState, year: number, id: string): CityDetail | null {
  const c = cityNow(state, id);
  if (!c) return null;
  const sp = START_POINTS.find((s) => s.year === year)!;
  const colorOf = (partyId: string | null | undefined, label?: string) =>
    (partyId ? state.t.parties.get(partyId)?.color : undefined) ?? (label ? profileFor(label, year).color : "#64748b");
  const acr = (partyId: string | null) => (partyId ? state.t.parties.get(partyId)?.acronym ?? null : null);
  const totalPres = Object.values(c.president).reduce((s, v) => s + v, 0) || 1;
  // dado real: titular que renunciou para disputar a eleição geral (o vice assumiu)
  const baseMayor = state.cities?.get(id)?.mayor as { replaced?: CityDetail["replaced"] } | null | undefined;
  const persons = [...state.t.persons.values()].filter((p) => p.status === "ACTIVE" && canonicalGeo(p.municipality) === id);
  return {
    id: c.id,
    name: c.name,
    uf: c.uf,
    capital: c.capital,
    electorate: c.electorate,
    mayor: c.mayor ? { ...c.mayor, color: colorOf(c.mayor.partyId, c.mayor.partyLabel), href: c.mayor.personId ? `/jogo/${year}/pessoa/${c.mayor.personId}` : null } : null,
    mayorElect: c.mayorElect ? { ...c.mayorElect, color: colorOf(c.mayorElect.partyId, c.mayorElect.partyLabel) } : null,
    replaced: c.mayor && !c.mayor.simulated && c.mayor.electedIn === year - 2 ? baseMayor?.replaced ?? null : null,
    council: c.council.map((x) => ({ partyId: x.partyId, label: x.label, color: colorOf(x.partyId, x.label), seats: x.seats })),
    president: Object.entries(c.president)
      .map(([name, votes]) => ({ name, votes, pct: (votes / totalPres) * 100, color: profileFor(name === sp.winner ? sp.winnerParty : sp.rivalParty, year).color }))
      .sort((a, b) => b.votes - a.votes),
    players: persons.filter((p) => p.kind === "PLAYER").map((p) => ({ id: p.id, name: p.name, party: acr(p.party_id), stage: p.stage })),
    locals: persons
      .filter((p) => p.kind !== "PLAYER")
      .slice(0, 12)
      .map((p) => ({ id: p.id, name: p.name, party: acr(p.party_id), role: p.role_label ?? p.office_code ?? "político(a)" })),
  };
}
