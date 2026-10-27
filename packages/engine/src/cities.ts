/**
 * Municípios. Os dados reais de partida (prefeito, câmara, eleitorado) vêm de
 * data/municipios-<ano>.json. O motor só abre disputas completas nas capitais
 * e nas cidades com jogadores; nas demais, o resultado de cada eleição
 * municipal é calculado aqui, de forma determinística, a partir da câmara
 * local e da força estadual dos partidos registrada no dia da eleição.
 */
import { canonicalGeo, capitalId, hasMunicipalElections, isMunicipality, ufOfMunicipality, UFS, type CityBase } from "./geo";
import { generateName } from "./names";
import { resolveAcronym } from "./parties";
import { inaugurationDate } from "./ruleset";
import { rngFor } from "./rng";
import type { Ctx, WorldState } from "./state";
import type { ElectionRow, PartyRow } from "./types";

export interface CityMayor {
  name: string;
  partyId: string | null;
  partyLabel: string;
  personId: string | null;
  terms: number;
  /** ano da eleição que o elegeu */
  electedIn: number;
  /** resultado calculado (cidade sem disputa ativa no jogo) */
  simulated: boolean;
}

export interface CityNow {
  id: string;
  uf: string;
  name: string;
  capital: boolean;
  electorate: number;
  mayor: CityMayor | null;
  council: Array<{ partyId: string | null; label: string; seats: number }>;
  /** votos reais do 2º turno presidencial do ano de partida */
  president: Record<string, number>;
  /** eleito e ainda não empossado */
  mayorElect: CityMayor | null;
}

/** Força estadual dos partidos guardada no dia da eleição municipal (0..1 por UF). */
export type TerritorySnapshot = Record<string, Record<string, number>>;

export function cityName(s: { cities?: Map<string, CityBase> }, geo: string): string | null {
  return s.cities?.get(canonicalGeo(geo))?.name ?? null;
}

/** Cidades com disputa completa no motor: capitais (exceto Brasília) e cidades-base de jogadores. */
export function activeCities(ctx: Ctx): string[] {
  const set = new Set<string>();
  for (const u of UFS) if (hasMunicipalElections(u.code)) set.add(capitalId(u.code));
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const g = canonicalGeo(p.municipality);
    if (isMunicipality(g) && hasMunicipalElections(ufOfMunicipality(g))) set.add(g);
  }
  return [...set].sort();
}

export function snapshotTerritory(parties: Iterable<PartyRow>): TerritorySnapshot {
  const out: TerritorySnapshot = {};
  for (const p of parties) {
    if (p.status !== "ATIVO") continue;
    const t: Record<string, number> = {};
    for (const [uf, v] of Object.entries(p.territory)) if (v > 0.001) t[uf] = Math.round(v * 1000) / 1000;
    out[p.id] = t;
  }
  return out;
}

/** Mapa sigla (como aparece nos dados do TSE) → partido do mundo, seguindo fusões e trocas de nome. */
export function partyResolver(parties: Iterable<PartyRow>): (acronym: string) => PartyRow | null {
  const list = [...parties];
  const byAcr = new Map(list.map((p) => [p.acronym, p]));
  const available = new Set(byAcr.keys());
  const memo = new Map<string, PartyRow | null>();
  return (acr: string) => {
    if (!memo.has(acr)) {
      const r = resolveAcronym(acr, available);
      memo.set(acr, r ? byAcr.get(r) ?? null : null);
    }
    return memo.get(acr)!;
  };
}

interface CityState {
  mayor: CityMayor | null;
  council: Map<string, number>;
}

function dhondt(weights: Array<[string, number]>, seats: number): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < seats; i++) {
    let best: string | null = null;
    let bestQ = -1;
    for (const [k, w] of weights) {
      const q = w / ((out.get(k) ?? 0) + 1);
      if (q > bestQ) {
        bestQ = q;
        best = k;
      }
    }
    if (best === null) break;
    out.set(best, (out.get(best) ?? 0) + 1);
  }
  return out;
}

/** Uma eleição municipal numa cidade sem disputa ativa. */
function simulateElection(seed: string, e: ElectionRow, city: CityBase, prev: CityState, territory: TerritorySnapshot, start: TerritorySnapshot): CityState {
  const rng = rngFor(seed, "city", 0, `${e.id}:${city.id}`);
  const uf = city.uf;
  const totalSeats = [...prev.council.values()].reduce((s, n) => s + n, 0) || 9;
  const keys = new Set<string>([...prev.council.keys(), ...Object.keys(territory)]);
  if (prev.mayor?.partyId) keys.add(prev.mayor.partyId);
  const stateTotal = Object.values(territory).reduce((s, t) => s + (t[uf] ?? 0), 0) || 1;
  const weights: Array<[string, number]> = [];
  for (const k of keys) {
    if (!territory[k]) continue; // partido extinto ou fora do mundo
    const local = (prev.council.get(k) ?? 0) / totalSeats;
    const state = (territory[k][uf] ?? 0) / stateTotal;
    const momentum = ((territory[k][uf] ?? 0) + 0.02) / ((start[k]?.[uf] ?? territory[k][uf] ?? 0) + 0.02);
    const w = (local * 0.7 + state * 0.3 + 0.004) * Math.min(2, Math.max(0.5, momentum));
    if (w > 0) weights.push([k, w]);
  }
  if (!weights.length) return prev;

  const canRerun = !!prev.mayor && prev.mayor.terms < 2;
  const mayorWeights = weights.map(([k, w]) => [k, w * (prev.mayor?.partyId === k ? (canRerun ? 1.9 : 1.15) : 1)] as [string, number]);
  const winner = rng.weighted(mayorWeights, ([, w]) => w)[0];
  const reelected = canRerun && prev.mayor?.partyId === winner;
  const mayor: CityMayor = reelected
    ? { ...prev.mayor!, terms: prev.mayor!.terms + 1, electedIn: e.year, simulated: true }
    : { name: generateName(rng), partyId: winner, partyLabel: "", personId: null, terms: 1, electedIn: e.year, simulated: true };

  const noisy = weights.map(([k, w]) => [k, w * Math.exp(rng.normal(0, 0.25))] as [string, number]);
  return { mayor, council: dhondt(noisy, totalSeats) };
}

/**
 * Situação atual de uma cidade: dados reais de partida mais as eleições
 * municipais já realizadas no mundo (disputas reais nas cidades ativas,
 * resultado calculado nas demais).
 */
export function cityNow(s: WorldState, id: string, opts: { parties?: Map<string, PartyRow>; resolve?: (acr: string) => PartyRow | null } = {}): CityNow | null {
  const base = s.cities?.get(id);
  if (!base) return null;
  const parties = opts.parties ?? s.t.parties;
  const resolve = opts.resolve ?? partyResolver(parties.values());
  const startYear = Number(s.world.start_game_date.slice(0, 4));
  const realMayor = base.mayor;
  const rp = realMayor ? resolve(realMayor.party) : null;
  let state: CityState = {
    mayor: realMayor ? { name: realMayor.name, partyId: rp?.id ?? null, partyLabel: realMayor.party, personId: null, terms: 1, electedIn: startYear - 2, simulated: false } : null,
    council: new Map(),
  };
  for (const [acr, n] of Object.entries(base.council)) {
    const p = resolve(acr);
    const key = p?.id ?? `?${acr}`;
    state.council.set(key, (state.council.get(key) ?? 0) + n);
  }
  // capitais: o prefeito real é uma pessoa do mundo
  if (base.capital && state.mayor) {
    const m = [...s.t.mandates.values()].find((x) => x.office_code === "PREFEITO" && canonicalGeo(x.geo) === id && x.status === "ATIVO");
    if (m) state.mayor.personId = m.person_id;
  }

  const start = (s.t.elections.get(`e${startYear}`)?.summary?.territoryStart ?? {}) as TerritorySnapshot;
  const elections = [...s.t.elections.values()].filter((e) => e.kind === "MUNICIPAL" && e.summary?.cityTerritory).sort((a, b) => a.year - b.year);
  let elect: CityMayor | null = null;
  for (const e of elections) {
    const inaugurated = s.world.game_date >= inaugurationDate("PREFEITO", e.year);
    const mayorRace = s.t.races.get(`${e.id}:PREFEITO:${id}`);
    let next: CityState;
    if (mayorRace && mayorRace.status === "ENCERRADA") {
      const winnerId = mayorRace.results.elected?.[0];
      const w = winnerId ? s.t.persons.get(winnerId) : undefined;
      const res = (mayorRace.results.runoff ?? mayorRace.results.first)?.candidates.find((c) => c.person_id === winnerId);
      const council = new Map<string, number>();
      const councilRace = s.t.races.get(`${e.id}:VEREADOR:${id}`);
      for (const pr of councilRace?.results.first?.parties ?? []) if (pr.seats > 0) council.set(pr.party_id, pr.seats);
      next = {
        mayor: w ? { name: w.name, partyId: res?.party_id ?? w.party_id, partyLabel: "", personId: w.id, terms: 1, electedIn: e.year, simulated: false } : state.mayor,
        council: council.size ? council : state.council,
      };
    } else if (!mayorRace) {
      next = simulateElection(s.world.seed, e, base, state, e.summary.cityTerritory as TerritorySnapshot, start);
    } else continue; // disputa em andamento
    if (inaugurated) state = next;
    else elect = next.mayor;
  }

  const label = (key: string) => (key.startsWith("?") ? key.slice(1) : parties.get(key)?.acronym ?? key);
  if (state.mayor && !state.mayor.partyLabel && state.mayor.partyId) state.mayor.partyLabel = label(state.mayor.partyId);
  if (elect && !elect.partyLabel && elect.partyId) elect.partyLabel = label(elect.partyId);
  return {
    id,
    uf: base.uf,
    name: base.name,
    capital: base.capital,
    electorate: base.electorate,
    mayor: state.mayor,
    mayorElect: elect,
    council: [...state.council.entries()]
      .map(([k, seats]) => ({ partyId: k.startsWith("?") ? null : k, label: label(k), seats }))
      .sort((a, b) => b.seats - a.seats),
    president: base.president,
  };
}
