/** Formato de data/snapshot-2026.json (gerado por scripts/import-snapshot/import-2026.mjs). */
export interface SnapshotSource {
  id: string;
  title: string;
  url: string;
  publisher: string;
  license: string;
  retrieved_on: string;
}

export interface SnapshotCandidate {
  sq: string;
  name: string;
  party: string;
  party_number: number;
  birth_year: number | null;
  votes: number;
  share: number;
  elected: boolean;
  status: string;
  valid: boolean;
}

export interface SnapshotRace {
  office: "PRESIDENTE" | "GOVERNADOR" | "SENADOR" | "DEP_FEDERAL" | "DEP_ESTADUAL";
  geo: string;
  round: number;
  electorate: number;
  turnout: number;
  valid: number;
  blank: number;
  null_votes: number;
  quotient: number;
  candidates: SnapshotCandidate[];
  parties: Array<{ number: number; acronym: string; federation: string | null; votes: number; agr: string; agr_seats: number }>;
  federations: Array<{ code: string; acronym: string; name: string; members: number[] }>;
  coalitions: Array<{ agr: string; name: string; type: string; members: string[] }>;
}

export interface SnapshotPerson {
  sq: string;
  name: string;
  party: string;
  party_number: number;
  uf?: string;
  birth_year: number | null;
}

export interface Snapshot {
  meta: { year: number; snapshot_date: string; generated_at: string; note: string; result_source_id: string; candidates_source_id: string };
  sources: SnapshotSource[];
  electorate: { BR: number; uf: Record<string, number> };
  parties: Array<{ number: number; acronym: string; name: string; federation: string | null }>;
  federations: Array<{ code: string; acronym: string; name: string; members: number[] }>;
  races: SnapshotRace[];
  /** senadores eleitos 4 anos antes, com mandato em curso */
  senatorsContinuing: Array<SnapshotPerson & { uf: string }>;
  /** prefeitos e câmaras das capitais eleitos 2 anos antes */
  municipalCapitals: Record<string, { capital: string; mayor: SnapshotPerson | null; council: Record<string, number> }>;
  /** quem exercia a Presidência na data do snapshot */
  incumbentPresident: (SnapshotPerson & { note: string | null }) | null;
  economy: {
    selic: { date: string; value: number } | null;
    ipca_12m: { date: string; value: number } | null;
    ipca_month: { date: string; value: number } | null;
    fx_usd: { date: string; value: number } | null;
    debt_gdp: { date: string; value: number } | null;
    unemployment: { date: string; value: number } | null;
    gdp_growth: number;
    gdp_level: number;
    source_id: string;
  };
}

export function findRace(s: Snapshot, office: SnapshotRace["office"], geo: string, round = 1): SnapshotRace | undefined {
  return s.races.find((r) => r.office === office && r.geo === geo && r.round === round);
}
