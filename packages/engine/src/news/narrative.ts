import type { Rng } from "../rng";
import type { NarrativeFacts } from "./policy";
import { TEMPLATES } from "./templates";

export interface RenderedNews {
  headline: string;
  body: string;
}

/**
 * "A IA escreve a história; o motor decide o que aconteceu."
 * Qualquer provider recebe um pacote fechado de fatos e permissões e só devolve texto.
 * O provider de templates é o padrão; um provider de LLM pode ser plugado depois
 * desde que respeite a mesma interface e passe pela validação pós-renderização.
 */
export interface NarrativeProvider {
  readonly id: string;
  render(kind: string, facts: NarrativeFacts, rng: Rng): RenderedNews;
}

export function fillTemplate(template: string, facts: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = facts[key];
    if (v === undefined || v === null) throw new Error(`Fato ausente para o template: ${key}`);
    return String(v);
  });
}

export class TemplateNarrativeProvider implements NarrativeProvider {
  readonly id = "templates-v1";

  render(kind: string, facts: NarrativeFacts, rng: Rng): RenderedNews {
    const tpl = TEMPLATES[kind];
    if (!tpl) throw new Error(`Template desconhecido: ${kind}`);
    const variant = rng.pick(tpl.variants);
    return {
      headline: fillTemplate(variant.h, facts.facts),
      body: fillTemplate(variant.b, facts.facts),
    };
  }
}

export const defaultNarrativeProvider: NarrativeProvider = new TemplateNarrativeProvider();
