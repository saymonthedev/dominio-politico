/**
 * Tipos de linha do banco. O motor opera diretamente sobre linhas com o mesmo
 * formato das tabelas do Postgres (snake_case) para evitar camadas de mapeamento.
 */
import type { ISODate } from "./calendar";
import type { Ideology } from "./ideology";
import type { ElectionKind, OfficeCode } from "./ruleset";

export type PersonKind = "REAL_HISTORICAL" | "REAL_ACTIVE_AT_SNAPSHOT" | "FICTIONAL_GENERATED" | "PLAYER";

export type CareerStage =
  | "CIDADAO"
  | "ATIVISTA"
  | "APROXIMACAO"
  | "FILIADO"
  | "QUADRO"
  | "PRE_CANDIDATO"
  | "CANDIDATO"
  | "MANDATO";

export interface Traits {
  ambition: number;
  loyalty: number;
  riskTolerance: number;
  competence: number;
  charisma: number;
}

export interface WorldRow {
  id: string;
  name: string;
  seed: string;
  ruleset_version: string;
  tick: number;
  game_date: ISODate;
  start_game_date: ISODate;
  /** relógio: game_tick = anchor_tick + floor(horas_reais_desde_anchor * game_days_per_real_hour) */
  anchor_real_at: string;
  anchor_tick: number;
  game_days_per_real_hour: number;
  election_integrity_mode: boolean;
  gov: GovState;
  stats: Record<string, number>;
}

export interface GovState {
  president_id: string | null;
  approval: number;
  /** -1 (contracionista) a +1 (expansionista) */
  fiscal_stance: number;
  base_party_ids: string[];
}

export interface PersonRow {
  id: string;
  world_id: string;
  kind: PersonKind;
  user_id: string | null;
  name: string;
  birth_year: number;
  uf: string;
  municipality: string;
  profession: string;
  origin: string;
  party_id: string | null;
  faction_id: string | null;
  stage: CareerStage;
  reputation: number;
  visibility: number;
  ideology: Ideology;
  status: "ACTIVE" | "RETIRED";
  status_note: string | null;
  office_code: OfficeCode | null;
  office_geo: string | null;
  /** apenas pessoas reais: rótulo factual de partido (não participa do sistema de partidos do jogo) */
  real_party_label: string | null;
  source_id: string | null;
  /** referência externa (ex.: SQ_CANDIDATO do TSE) */
  external_ref: string | null;
  /** 1 = nacional, 2 = estadual, 3 = local */
  tier: number;
  /** papel descritivo para personagens procedurais (ex.: "dirigente estadual") */
  role_label: string | null;
  created_tick: number;
}

export interface ActionLogEntry {
  n: number;
  last_tick: number;
}

export interface Offer {
  id: string;
  kind: "CAIXA_DOIS" | "PROPINA";
  from: string;
  amount: number;
  expires_tick: number;
}

export interface PersonStateRow {
  id: string;
  world_id: string;
  user_id: string | null;
  traits: Traits;
  money: number;
  energy: number;
  political_capital: number;
  party_standing: number;
  debate_prep: number;
  scandal: number;
  /** reconhecimento do nome por UF (0–1) */
  reach: Record<string, number>;
  action_log: Record<string, ActionLogEntry>;
  offers: Offer[];
  interests: string[];
  domicile_since: ISODate;
  filiation_date: ISODate | null;
  ineligible_until: ISODate | null;
  activism: number;
  income_last_year: number;
  last_action_tick: number;
  action_seq: number;
  /** dossiês montados pelo jogador: alvo → força das provas (0–1) */
  dossiers: Record<string, number>;
}

export type EntryCulture = "ABERTO" | "RELACIONAMENTO" | "CONVITE";

export interface PartyRow {
  id: string;
  world_id: string;
  name: string;
  acronym: string;
  number: number;
  ideology: Ideology;
  entry_culture: EntryCulture;
  reputation: number;
  cash: number;
  discipline: number;
  color: string;
  description: string;
  gov_alignment: number;
  president_id: string | null;
  /** força organizacional por UF (0–1) */
  territory: Record<string, number>;
  /** bancadas: camara, senado, assembleias[UF], camaras[UF] */
  seats: Record<string, number>;
  members: number;
  /** integridade institucional emergente (0–1). Todos começam iguais. */
  integrity: number;
  federation: string | null;
  federation_name: string | null;
  is_fictional: boolean;
  status: "ATIVO" | "EXTINTO";
}

export interface FactionRow {
  id: string;
  world_id: string;
  party_id: string;
  name: string;
  ideology: Ideology;
  strength: number;
  leader_id: string | null;
}

export interface MembershipRow {
  id: string;
  world_id: string;
  person_id: string;
  party_id: string;
  role: "MEMBRO" | "DIRIGENTE" | "PRESIDENTE";
  joined_on: ISODate;
  left_on: ISODate | null;
  status: "ATIVA" | "ENCERRADA";
}

export interface AffiliationRequestRow {
  id: string;
  world_id: string;
  person_id: string;
  party_id: string;
  kind: "PEDIDO" | "CONVITE";
  created_on: ISODate;
  decide_on: ISODate;
  status: "PENDENTE" | "ACEITO" | "RECUSADO" | "EXPIRADO" | "RETIRADO";
  breakdown: Record<string, number>;
  reason: string | null;
}

export interface RelationshipRow {
  id: string;
  world_id: string;
  a_id: string;
  b_id: string;
  score: number;
  interactions: number;
  last_on: ISODate;
}

export type ElectionStatus = "AGENDADA" | "PRE_CAMPANHA" | "CONVENCOES" | "CAMPANHA" | "SEGUNDO_TURNO" | "ENCERRADA";

export interface ElectionRow {
  id: string;
  world_id: string;
  year: number;
  kind: ElectionKind;
  first_round: ISODate;
  runoff: ISODate;
  calendar: Record<string, ISODate>;
  status: ElectionStatus;
  summary: Record<string, unknown>;
}

export interface CandidateResult {
  candidacy_id: string;
  person_id: string;
  name: string;
  party_id: string;
  votes: number;
  share: number;
}

export interface PartyListResult {
  party_id: string;
  votes: number;
  share: number;
  seats: number;
}

export interface RaceRow {
  id: string;
  world_id: string;
  election_id: string;
  office_code: OfficeCode;
  geo: string;
  seats: number;
  electorate: number;
  status: "ABERTA" | "SEGUNDO_TURNO" | "ENCERRADA";
  /** resultados por turno */
  results: {
    first?: { candidates: CandidateResult[]; parties?: PartyListResult[]; turnout: number; invalid: number; valid: number };
    runoff?: { candidates: CandidateResult[]; turnout: number; invalid: number; valid: number };
    elected?: string[];
  };
  latest_poll: Record<string, number> | null;
}

export interface CampaignState {
  budget: number;
  spent: number;
  fefc: number;
  donations: number;
  volunteers: number;
  team: Record<string, number>;
  momentum: number;
  debate_score: number;
  proposals: Array<{ axis: string; value: number; title: string }>;
  rumor_damage: number;
}

export interface CandidacyRow {
  id: string;
  world_id: string;
  election_id: string;
  race_id: string;
  person_id: string;
  party_id: string;
  office_code: OfficeCode;
  geo: string;
  status: "PRE" | "HOMOLOGADA" | "INDEFERIDA" | "DESISTENTE" | "ELEITO" | "NAO_ELEITO" | "SEGUNDO_TURNO" | "SUPLENTE";
  is_player: boolean;
  ballot_number: number;
  campaign: CampaignState;
  votes: number;
  vote_share: number;
  note: string | null;
}

export interface MandateRow {
  id: string;
  world_id: string;
  person_id: string;
  office_code: OfficeCode;
  geo: string;
  start_on: ISODate;
  end_on: ISODate;
  status: "FUTURO" | "ATIVO" | "ENCERRADO";
  election_id: string | null;
  approval: number;
}

export interface BillRow {
  id: string;
  world_id: string;
  chamber: string;
  title: string;
  summary: string;
  axis: string;
  direction: number;
  author_party_id: string | null;
  author_person_id: string | null;
  gov_position: number;
  vote_on: ISODate;
  status: "TRAMITANDO" | "APROVADO" | "REJEITADO";
  votes: { yes: number; no: number; abstain: number };
  player_votes: Record<string, "SIM" | "NAO" | "ABSTENCAO">;
  fiscal_effect: number;
}

export interface PolicyRow {
  id: string;
  world_id: string;
  owner_person_id: string;
  office_code: OfficeCode;
  geo: string;
  kind: string;
  title: string;
  started_on: ISODate;
  completes_on: ISODate;
  status: "EM_ANDAMENTO" | "CONCLUIDA" | "ATRASADA" | "CANCELADA";
  cost: number;
  delays: number;
  effects: Record<string, number>;
}

export type IllicitKind = "CAIXA_DOIS" | "PROPINA" | "DESINFORMACAO";

export interface IllicitActRow {
  id: string;
  world_id: string;
  person_id: string;
  kind: IllicitKind;
  created_on: ISODate;
  amount: number;
  value_relative: number;
  participants: number;
  witnesses: number;
  paper_trail: number;
  recurrence: number;
  exposure: number;
  accomplice_loyalty: number;
  /** cúmplices (operadores, empresários) */
  partners: string[];
  party_id: string | null;
  description: string;
  discovered: boolean;
  discovered_on: ISODate | null;
}

export type InvestigationStage = "DENUNCIA" | "IMPRENSA" | "INVESTIGACAO" | "PROCESSO" | "DESFECHO";

export interface InvestigationRow {
  id: string;
  world_id: string;
  person_id: string;
  stage: InvestigationStage;
  opened_on: ISODate;
  next_step_on: ISODate;
  evidence: number;
  defense: number;
  evidences: Array<{ on: ISODate; description: string; strength: number }>;
  outcome: null | "ARQUIVADO" | "ABSOLVIDO" | "CONDENADO";
  /** quem conduz: Polícia Federal, Ministério Público, CPI ou imprensa */
  authority: "PF" | "MP" | "CPI" | "IMPRENSA";
  /** jogador que acionou as autoridades, se houver */
  opened_by: string | null;
  /** atos cobertos (pode ser vazio se a denúncia não tiver base) */
  act_ids: string[];
}

export interface RumorRow {
  id: string;
  world_id: string;
  target_id: string;
  source_id: string | null;
  topic: string;
  created_on: ISODate;
  reach: number;
  credibility: number;
  bots: number;
  status: "ATIVO" | "DESMENTIDO" | "ESQUECIDO";
}

export interface DebateRow {
  id: string;
  world_id: string;
  race_id: string;
  outlet: string;
  scheduled_on: ISODate;
  status: "AGENDADO" | "REALIZADO";
  participants: string[];
  results: Record<string, number>;
  player_choices: Record<string, { theme: string; stance: string; risk: number }>;
}

export interface VoterSegmentRow {
  id: string;
  world_id: string;
  uf: string;
  segment: string;
  weight: number;
  ideology: Ideology;
  turnout: number;
  econ_sensitivity: number;
  mood: number;
}

export interface EconomyRow {
  id: string;
  world_id: string;
  month: string;
  gdp_growth: number;
  gdp_level: number;
  inflation_12m: number;
  inflation_month: number;
  unemployment: number;
  selic: number;
  debt_gdp: number;
  primary_balance: number;
  confidence: number;
  fx: number;
  external_demand: number;
  fiscal_impulse: number;
  output_gap: number;
  productivity: number;
  supply_shock: number;
  expectations: number;
}

export interface WorldEventRow {
  id: string;
  world_id: string;
  tick: number;
  type: string;
  game_date: ISODate;
  actors: string[];
  geography: string;
  payload: Record<string, unknown>;
  seed: string;
}

export interface NewsRow {
  id: string;
  world_id: string;
  event_id: string | null;
  tick: number;
  game_date: ISODate;
  outlet: string;
  category: string;
  headline: string;
  body: string;
  geography: string;
  person_ids: string[];
  importance: number;
  visibility: "PUBLIC" | "PRIVATE";
  user_id: string | null;
  /** true apenas para fatos reais do snapshot, sempre com fonte */
  factual: boolean;
  source_id: string | null;
}

export interface NotificationRow {
  id: string;
  world_id: string;
  user_id: string;
  person_id: string;
  tick: number;
  game_date: ISODate;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
}

export interface FinanceRow {
  id: string;
  world_id: string;
  person_id: string;
  candidacy_id: string | null;
  kind: "DOACAO" | "FEFC" | "RECURSO_PROPRIO" | "DESPESA" | "RENDA" | "NAO_DECLARADO" | "CONTRIBUICAO_PARTIDO";
  amount: number;
  declared: boolean;
  game_date: ISODate;
  description: string;
}

export interface PollRow {
  id: string;
  world_id: string;
  race_id: string;
  institute: string;
  game_date: ISODate;
  sample: number;
  margin: number;
  results: Array<{ id: string; name: string; party: string; pct: number }>;
  undecided: number;
  private_for: string | null;
}

/** Mapa nome-da-tabela → tipo da linha, para o coletor de mudanças. */
export interface TableRows {
  worlds: WorldRow;
  persons: PersonRow;
  person_states: PersonStateRow;
  parties: PartyRow;
  factions: FactionRow;
  memberships: MembershipRow;
  affiliation_requests: AffiliationRequestRow;
  relationships: RelationshipRow;
  elections: ElectionRow;
  races: RaceRow;
  candidacies: CandidacyRow;
  mandates: MandateRow;
  bills: BillRow;
  policies: PolicyRow;
  illicit_acts: IllicitActRow;
  investigations: InvestigationRow;
  rumors: RumorRow;
  debates: DebateRow;
  voter_segments: VoterSegmentRow;
  economy_snapshots: EconomyRow;
  world_events: WorldEventRow;
  news_articles: NewsRow;
  notifications: NotificationRow;
  finance_transactions: FinanceRow;
  polls: PollRow;
}

export type TableName = keyof TableRows;
