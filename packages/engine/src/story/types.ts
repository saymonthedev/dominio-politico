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
  | "DINHEIRO";

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
}

export type Binding = Record<string, string | number>;
