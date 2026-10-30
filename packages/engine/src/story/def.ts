import type { PersonRow } from "../types";
import type { StoryCtx } from "./context";
import type { Effects } from "./effects";
import type { Binding, ChoiceTone, StoryKind, StoryTag } from "./types";

export interface ChoiceDef {
  id: string;
  label: string;
  hint?: string;
  tone?: ChoiceTone;
  cost?: { money?: number; energy?: number };
  /** null = disponível; texto = motivo de não estar */
  requires?: (c: StoryCtx, b: Binding) => string | null;
}

export interface Rendered {
  title: string;
  text: string;
  who?: PersonRow | null;
  choices: ChoiceDef[];
}

/**
 * Definição de um acontecimento.
 *
 * when(): devolve o contexto amarrado (quem, onde, quanto) se o evento faz
 * sentido agora — não é sorteio puro: cada evento olha carreira, dinheiro,
 * partido, campanha, contatos, histórico e economia. Os encadeados recebem os
 * dados de quem os marcou e só confirmam se ainda fazem sentido.
 */
export interface EventDef {
  id: string;
  kind: StoryKind;
  tags: StoryTag[];
  /** segura o avanço automático (padrão: DECISAO segura; os demais não) */
  blocking?: boolean;
  /** peso base no sorteio (padrão 1) */
  weight?: number;
  /** dias mínimos entre duas ocorrências (padrão 60) */
  cooldown?: number;
  /** máximo por carreira (padrão: sem limite) */
  max?: number;
  /** só acontece como continuação de outro acontecimento ou do motor */
  chained?: boolean;
  /** dias para responder (padrão: DECISAO 5, OPORTUNIDADE 14) */
  expires?: number;
  /** entra no resumo da carreira */
  milestone?: boolean;
  when: (c: StoryCtx, data?: Binding) => Binding | null;
  /** relevância no momento (multiplica o peso) */
  weightFn?: (c: StoryCtx, b: Binding) => number;
  render: (c: StoryCtx, b: Binding) => Rendered;
  resolve: (c: StoryCtx, b: Binding, choice: string, fx: Effects) => string;
  /** escolha aplicada se o prazo vencer (padrão: a última opção) */
  fallback?: string;
  /** o evento pendente ainda faz sentido? (ex.: o convite não foi respondido por outra tela) */
  valid?: (c: StoryCtx, b: Binding) => boolean;
}

/** Ajuda a escrever o texto com variações estáveis por evento. */
export function vary<T>(c: StoryCtx, key: string, options: readonly T[]): T {
  return options[Math.abs(hashKey(`${c.p.id}:${key}:${c.date}`)) % options.length];
}

function hashKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
