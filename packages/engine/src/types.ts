/**
 * Tipos de linha do banco. O motor opera diretamente sobre linhas com o mesmo
 * formato das tabelas do Postgres (snake_case) para evitar camadas de mapeamento.
 */
import type { ISODate } from "./calendar";
import type { Ideology } from "./ideology";
import type { ChargeKind, DetectionChannel, IllicitKind } from "./crimes";
import type { ElectionKind, OfficeCode } from "./ruleset";
import type { StoryState } from "./story/types";

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

/** Linha do fechamento mensal (extrato resumido). */
export interface LedgerItem {
  kind: string;
  label: string;
  amount: number;
}

export interface Ledger {
  /** mês fechado (AAAA-MM) */
  month: string | null;
  items: LedgerItem[];
  net: number;
}

/** Achado de um dossiê: o que de fato apareceu nas fontes consultadas. */
export interface Finding {
  id: string;
  on: ISODate;
  /** ato ilícito a que o achado se refere (null = nada ou boato) */
  act_id: string | null;
  crime: IllicitKind | null;
  text: string;
  /** força do indício (0–1) */
  strength: number;
  /** documento ou testemunho verificável (false = boato sem prova) */
  verified: boolean;
  /** de quem é o ato (útil em dossiês sobre partidos) */
  person_id: string | null;
}

/** Pena aplicada numa condenação. */
export interface Sentence {
  years: number;
  regime: "FECHADO" | "SEMIABERTO" | "ABERTO" | "SEM_PRISAO";
  fine: number;
  ineligible_until: ISODate | null;
  cassation: boolean;
  charges: ChargeKind[];
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
  /** achados de cada dossiê (chave: id da pessoa ou "party:<id>") */
  findings: Record<string, Finding[]>;
  /** dinheiro não declarado (em espécie, com laranjas ou em contas de terceiros) */
  dirty_money: number;
  /** dívida bancária */
  debt: number;
  /** bens declarados (imóveis, veículos, participações) */
  assets: number;
  /** último fechamento mensal */
  ledger: Ledger;
  /** conquistas da carreira: id → data em que aconteceu */
  achievements: Record<string, ISODate>;
  /** cumprindo pena em regime fechado até */
  jailed_until: ISODate | null;
  /** última condenação */
  sentence: Sentence | null;
  /** eventos, escolhas, memória e saúde do personagem (só jogadores; null nos demais) */
  story: StoryState | null;
}

export type EntryCulture = "ABERTO" | "RELACIONAMENTO" | "CONVITE";

/** Cota do FEFC de um partido de jogador numa eleição: a presidência reparte entre as candidaturas. */
export interface CampaignFund {
  election_id: string;
  total: number;
  left: number;
  /** repasses por candidatura */
  given: Record<string, number>;
}

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
  status: "ATIVO" | "EXTINTO" | "EM_FORMACAO";
  /** jogador que fundou o partido (partidos criados no jogo) */
  founder_id: string | null;
  founded_on: ISODate | null;
  /** coleta de apoiamento e registro no TSE */
  formation: PartyFormation | null;
  /** cotas do fundo partidário suspensas até (sanção da Justiça Eleitoral) */
  fund_suspended_until: ISODate | null;
  /** fundo eleitoral do partido para repartir entre candidaturas (partidos presididos por jogador) */
  campaign_fund: CampaignFund | null;
}

export interface PartyFormation {
  stage: "APOIAMENTO" | "REGISTRO" | "CONCLUIDA" | "FRACASSADA";
  started_on: ISODate;
  /** prazo de dois anos para o apoiamento (Lei 9.096/95, art. 7º, §1º) */
  deadline: ISODate;
  /** assinaturas exigidas: 0,5% dos votos válidos da última eleição para a Câmara */
  goal: number;
  /** mínimo por UF: 0,1% do eleitorado */
  uf_goal: Record<string, number>;
  /** UFs que precisam atingir o mínimo (um terço das unidades da Federação) */
  ufs_needed: number;
  signatures: number;
  by_uf: Record<string, number>;
  spent: number;
  /** julgamento do pedido de registro */
  registry_on: ISODate | null;
  /** assinaturas invalidadas na conferência do TSE */
  rejected: number;
  /** fundador ainda não se filiou (mandato proporcional fora da janela) */
  founder_pending: boolean;
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
  /** segmentos de eleitores priorizados pela estratégia */
  focus?: string[];
  /** tom da campanha */
  tone?: "PROPOSITIVO" | "ATAQUE" | "DEFENSIVO";
  /** apoio conquistado (ou perdido) em cada segmento de eleitores (-1..1) */
  seg?: Record<string, number>;
  /** promessas feitas a grupos de eleitores (cobradas no mandato) */
  promises?: Array<{ id: string; title: string; segment: string; on: string; kept?: boolean }>;
  /** o que moveu a campanha desde a última pesquisa (para explicar as oscilações) */
  journal?: Array<{ on: string; cause: string; delta: number }>;
  /** última pesquisa vista pela campanha */
  last_poll?: { on: string; pct: number; rank: number; leader: string; leader_pct: number } | null;
  /** gastos por categoria (prestação de contas) */
  costs?: Record<string, number>;
  /** cabos eleitorais contratados (legais) */
  canvassers?: number;
  /** personalidade da campanha (NPCs): agressiva, populista, técnica, veterana */
  persona?: "AGRESSIVA" | "POPULISTA" | "TECNICA" | "VETERANA";
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
  /** esquema que se repete todo mês (rachadinha, fantasma, cota) */
  ongoing: boolean;
  monthly_gain: number;
  stopped_on: ISODate | null;
  /** cargo e lugar em que a conduta aconteceu */
  office_code: OfficeCode | null;
  geo: string | null;
  /** efeito eleitoral (compra de votos, máquina, abuso) */
  votes_gain: number;
}

export type InvestigationStage = "DENUNCIA" | "IMPRENSA" | "INVESTIGACAO" | "PROCESSO" | "DESFECHO";

export type Authority = "PF" | "MP" | "MP_ELEITORAL" | "CPI" | "IMPRENSA" | "TRIBUNAL_CONTAS" | "JUSTICA_ELEITORAL";

export interface InvestigationMeasure {
  on: ISODate;
  kind: "BUSCA" | "QUEBRA_SIGILO" | "BLOQUEIO_BENS" | "PRISAO_PREVENTIVA" | "AFASTAMENTO" | "DENUNCIA_ACEITA" | "DEPOIMENTO" | "ACORDO";
  text: string;
}

export interface InvestigationRow {
  id: string;
  world_id: string;
  /** pessoa investigada (null quando o alvo é só o partido) */
  person_id: string | null;
  /** partido investigado ou envolvido */
  party_id: string | null;
  target_type: "PESSOA" | "PARTIDO";
  /** acusações em apuração */
  crimes: ChargeKind[];
  /** como o caso começou */
  channel: DetectionChannel | "DENUNCIA" | "CPI" | null;
  /** medidas tomadas no caso (busca, quebra de sigilo, prisão...) */
  measures: InvestigationMeasure[];
  /** pena, quando há condenação */
  sentence: Sentence | null;
  stage: InvestigationStage;
  opened_on: ISODate;
  next_step_on: ISODate;
  evidence: number;
  defense: number;
  evidences: Array<{ on: ISODate; description: string; strength: number }>;
  outcome: null | "ARQUIVADO" | "ABSOLVIDO" | "CONDENADO";
  /** quem conduz o caso */
  authority: Authority;
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
  /** AO_VIVO: aconteceu, mas espera a escolha de um jogador para fechar o placar */
  status: "AGENDADO" | "AO_VIVO" | "REALIZADO";
  participants: string[];
  results: Record<string, number>;
  /** estratégia de cada jogador; live = resultado do momento decisivo respondido ao vivo */
  player_choices: Record<string, { theme: string; stance: string; risk: number; live?: number }>;
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

export type FinanceKind =
  | "DOACAO"
  | "FEFC"
  | "RECURSO_PROPRIO"
  | "DESPESA"
  | "RENDA"
  | "NAO_DECLARADO"
  | "CONTRIBUICAO_PARTIDO"
  | "SUBSIDIO"
  | "IMPOSTO"
  | "RENDIMENTO"
  | "CUSTO_VIDA"
  | "JUROS"
  | "EMPRESTIMO"
  | "AMORTIZACAO"
  | "FUNDACAO_PARTIDO"
  | "COLETA_ASSINATURAS"
  | "LAVAGEM"
  | "MULTA";

export interface FinanceRow {
  id: string;
  world_id: string;
  person_id: string;
  candidacy_id: string | null;
  kind: FinanceKind;
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
