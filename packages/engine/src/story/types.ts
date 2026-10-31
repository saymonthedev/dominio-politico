import type { ISODate } from "../calendar";

/**
 * Eventos da carreira ("story"): pequenas histórias com contexto, escolhas e
 * consequências, inspiradas nos acontecimentos de jogos de vida como o BitLife,
 * mas presas ao estado do mundo político (partido, campanha, contatos, dinheiro,
 * reputação, economia) e encadeadas ao longo de dias, semanas ou meses.
 */

/**
 * INFO: algo aconteceu (não pede escolha).
 * OPORTUNIDADE: pode ser respondida até o prazo; não segura o tempo.
 * DECISAO: pede resposta; quando "segura", o avanço automático para até a resposta.
 */
export type StoryKind = "INFO" | "OPORTUNIDADE" | "DECISAO";

export type StoryTag =
  | "VIDA"
  | "TRABALHO"
  | "COMUNIDADE"
  | "PARTIDO"
  | "FILIACAO"
  | "CAMPANHA"
  | "DEBATE"
  | "ELEICAO"
  | "MANDATO"
  | "BASTIDORES"
  | "IMPRENSA"
  | "SAUDE"
  | "DINHEIRO"
  | "CASA"
  | "LAZER";

export type ChoiceTone = "safe" | "bold" | "risky" | "illegal" | "neutral";

/** Escolha como a tela mostra. */
export interface StoryChoice {
  id: string;
  label: string;
  /** o que a escolha implica, em poucas palavras */
  hint?: string;
  tone?: ChoiceTone;
  /** custo imediato (para a tela e para conferir antes de aplicar) */
  cost?: { money?: number; energy?: number };
  /** motivo de estar indisponível */
  locked?: string | null;
}

export interface StoryWho {
  id: string;
  name: string;
  role: string | null;
}

/** Evento acontecendo agora para um personagem (pendente ou informativo). */
export interface StoryEvent {
  id: string;
  def: string;
  on: ISODate;
  /** prazo para responder; depois dele vale a escolha padrão */
  expires: ISODate | null;
  kind: StoryKind;
  /** segura o avanço automático do tempo até a resposta */
  blocking: boolean;
  tags: StoryTag[];
  title: string;
  text: string;
  who?: StoryWho | null;
  choices: StoryChoice[];
  /** contexto amarrado ao evento (ids, valores, nomes) */
  data: Record<string, string | number>;
  /** escolha aplicada quando o prazo vence */
  fallback?: string;
}

export interface StoryDelta {
  key: string;
  label: string;
  value: number;
  money?: boolean;
  /** subir é ruim (risco, dívida, dinheiro sujo) */
  bad?: boolean;
}

export interface StoryLogEntry {
  id: string;
  def: string;
  on: ISODate;
  title: string;
  tags: StoryTag[];
  kind: StoryKind;
  choice?: string;
  choiceLabel?: string;
  outcome: string;
  deltas?: StoryDelta[];
  /** marco da carreira (vai para o resumo final) */
  milestone?: boolean;
  /** resolvido sozinho, quando o prazo venceu */
  auto?: boolean;
  who?: StoryWho | null;
}

/** Continuação marcada para o futuro (encadeamento). */
export interface ScheduledStory {
  def: string;
  due: ISODate;
  data: Record<string, string | number>;
  /** evento que originou a continuação */
  from?: string;
}

/** Fim da carreira (morte ou aposentadoria) e o resumo para o pop-up final. */
export interface CareerEnd {
  on: ISODate;
  age: number;
  cause: "MORTE" | "APOSENTADORIA";
  /** texto respeitoso da causa (ex.: "complicações cardíacas") */
  detail: string;
}

export interface StoryState {
  v: number;
  pending: StoryEvent[];
  /** histórico, do mais recente para o mais antigo */
  log: StoryLogEntry[];
  queue: ScheduledStory[];
  /** memória do personagem: contatos, promessas, posições públicas, dívidas de favor */
  flags: Record<string, string | number | boolean>;
  /** quantas vezes cada evento aconteceu e quando foi o último */
  seen: Record<string, { n: number; last: ISODate }>;
  lastEvent: ISODate | null;
  /** saúde (0–100) */
  health: number;
  ended: CareerEnd | null;
  /** contadores para o resumo da carreira */
  counters: Record<string, number>;
  /** promessas de campanha (cobradas no mandato que elas ajudaram a conquistar) */
  promises?: Array<{ id: string; title: string; segment: string; on: ISODate; election: string; kept?: boolean }>;
  /** onde mora (família, aluguel, casa própria ou rua) */
  home?: Home;
  /** carro ou moto (null = sem veículo) */
  car?: Car | null;
  /** outros bens declarados (móveis, terrenos, investimentos), além da casa e do carro */
  other_assets?: number;
  /** bairro da família (para onde dá para voltar) */
  family_bairro?: string;
  /** cansaço (0–100): sobe com trabalho, política e campanha; cai com descanso */
  fatigue?: number;
  /** lesão em recuperação */
  injury?: Injury | null;
  /** aprovação popular (0–100) de quem tem mandato; null fora do cargo */
  approval?: number | null;
  /** o que mexeu na aprovação, do mais recente para o mais antigo */
  approval_log?: ApprovalEntry[];
  /** propostas do gabinete (em andamento e as últimas resolvidas) */
  proposals?: Proposal[];
}

export interface ApprovalEntry {
  on: ISODate;
  delta: number;
  cause: string;
}

export interface Injury {
  kind: string;
  label: string;
  since: ISODate;
  until: ISODate;
  /** fração da energia que volta por dia enquanto dura */
  energy: number;
  /** atrapalha andar (campanha de rua) */
  legs?: boolean;
}

export type HomeKind = "FAMILIA" | "ALUGUEL" | "PROPRIA" | "RUA";

export interface Loan {
  /** saldo devedor (R$ nominais) */
  balance: number;
  /** prestação mensal fixa (tabela Price) */
  installment: number;
  /** prestações que faltam */
  months: number;
  /** juros ao mês */
  rate: number;
}

export interface Home {
  kind: HomeKind;
  /** código IBGE da cidade */
  city: string;
  bairro: string;
  /** padrão: 0 quitinete, 1 simples, 2 médio, 3 alto, 4 luxo */
  tier: number;
  /** área (m²) */
  size: number;
  /** valor do imóvel no dia da compra (R$ nominais) e o nível de preços daquele dia */
  value: number;
  level: number;
  /** aluguel mensal (R$ nominais), reajustado a cada 12 meses */
  rent: number;
  since: ISODate;
  loan: Loan | null;
}

export type CarModel = "moto" | "popular_usado" | "popular_novo" | "medio" | "luxo";

export interface Car {
  model: CarModel;
  /** preço pago (R$ nominais) e o nível de preços do dia da compra */
  value: number;
  level: number;
  since: ISODate;
  loan: Loan | null;
}

export type ProposalKind = "INDICACAO" | "PROJETO" | "OBRA";
export type ProposalStage = "ENVIADA" | "PROTOCOLADA" | "COMISSAO" | "PLENARIO" | "SANCAO" | "ESTUDO" | "LICITACAO" | "OBRA" | "FIM";
export type ProposalResult = "ATENDIDA" | "NEGADA" | "LEI" | "REJEITADA" | "VETADA" | "ARQUIVADA" | "INAUGURADA" | "CANCELADA";

/** Proposta que chegou ao gabinete e anda por etapas (cada etapa vira um acontecimento). */
export interface Proposal {
  id: string;
  /** modelo do catálogo */
  tpl: string;
  title: string;
  kind: ProposalKind;
  /** quem trouxe (texto) e a pessoa, se for alguém do jogo */
  from: string;
  from_id: string | null;
  bairro: string | null;
  segment: string;
  stage: ProposalStage;
  /** chance de dar certo (0–1), que a articulação aumenta */
  support: number;
  /** pontos de aprovação popular se der certo */
  impact: number;
  on: ISODate;
  next: ISODate | null;
  done?: ISODate | null;
  result?: ProposalResult | null;
  /** texto mudado por emendas (rende menos) */
  amended?: boolean;
  /** dividida com colegas (mais votos, menos crédito) */
  shared?: boolean;
  log: Array<{ on: ISODate; text: string }>;
}

export type Binding = Record<string, string | number>;
