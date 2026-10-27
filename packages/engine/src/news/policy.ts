import type { PersonKind } from "../types";

/**
 * Content policy para pessoas reais (documento técnico, seção "Políticos e fotos reais").
 * O motor decide o que aconteceu; esta camada decide o que pode ser NARRADO sobre quem.
 */
export type ClaimType =
  | "FACTUAL_RESULT"
  | "FACTUAL_OFFICE"
  | "FACTUAL_PARTY"
  | "RETIREMENT_NEUTRAL"
  | "NEUTRAL_MENTION"
  | "FICTIONAL_PROPOSAL"
  | "CORRUPTION"
  | "CRIME"
  | "POLITICAL_BETRAYAL"
  | "HEALTH_PRIVATE"
  | "QUOTE"
  | "DEEPFAKE"
  | "GENERIC_AVATAR"
  | "SIMULATED_PERFORMANCE"
  | "SIMULATED_POLITICAL_MOVE";

export type Decision = "ALLOW" | "ALLOW_WITH_SOURCE" | "BLOCK";

export const CONTENT_POLICY: Record<ClaimType, { real: Decision; fictional: Decision; note: string }> = {
  FACTUAL_RESULT: { real: "ALLOW_WITH_SOURCE", fictional: "ALLOW", note: "Resultado eleitoral factual" },
  FACTUAL_OFFICE: { real: "ALLOW_WITH_SOURCE", fictional: "ALLOW", note: "Cargo factual" },
  FACTUAL_PARTY: { real: "ALLOW_WITH_SOURCE", fictional: "ALLOW", note: "Partido factual" },
  RETIREMENT_NEUTRAL: { real: "ALLOW", fictional: "ALLOW", note: "Saída neutra da linha do tempo simulada" },
  NEUTRAL_MENTION: { real: "BLOCK", fictional: "ALLOW", note: "Menção em acontecimento inventado" },
  FICTIONAL_PROPOSAL: { real: "BLOCK", fictional: "ALLOW", note: "Proposta fictícia — alto risco para pessoa real" },
  CORRUPTION: { real: "BLOCK", fictional: "ALLOW", note: "Corrupção inventada" },
  CRIME: { real: "BLOCK", fictional: "ALLOW", note: "Crime inventado" },
  POLITICAL_BETRAYAL: { real: "BLOCK", fictional: "ALLOW", note: "Traição política — extrema cautela; bloqueado por padrão" },
  HEALTH_PRIVATE: { real: "BLOCK", fictional: "ALLOW", note: "Saúde/vida íntima inventada" },
  QUOTE: { real: "BLOCK", fictional: "ALLOW", note: "Fala inventada entre aspas" },
  DEEPFAKE: { real: "BLOCK", fictional: "BLOCK", note: "Deepfake/voz clonada — não recomendado nem para NPCs" },
  GENERIC_AVATAR: { real: "BLOCK", fictional: "ALLOW", note: "Avatar sintético não pode imitar pessoa real" },
  SIMULATED_PERFORMANCE: { real: "ALLOW", fictional: "ALLOW", note: "Desempenho simulado (pesquisa, debate, votos), sempre rotulado como simulação" },
  SIMULATED_POLITICAL_MOVE: { real: "ALLOW", fictional: "ALLOW", note: "Ato político lícito simulado (candidatura, aliança, troca de partido, voto em projeto), rotulado como simulação" },
};

export const REAL_KINDS: PersonKind[] = ["REAL_HISTORICAL", "REAL_ACTIVE_AT_SNAPSHOT"];

export function isReal(kind: PersonKind): boolean {
  return REAL_KINDS.includes(kind);
}

export interface PolicySubject {
  id: string;
  name: string;
  kind: PersonKind;
  source_id: string | null;
}

export interface PolicyInput {
  claims: ClaimType[];
  subjects: PolicySubject[];
  /** fonte do fato, obrigatória para ALLOW_WITH_SOURCE */
  sourceId?: string | null;
  integrityMode?: boolean;
}

export interface PolicyResult {
  allowed: boolean;
  reasons: string[];
}

export function evaluatePolicy(input: PolicyInput): PolicyResult {
  const reasons: string[] = [];
  for (const subject of input.subjects) {
    const real = isReal(subject.kind);
    for (const claim of input.claims) {
      const rule = CONTENT_POLICY[claim];
      const decision = real ? rule.real : rule.fictional;
      if (decision === "BLOCK") {
        reasons.push(`${claim} bloqueado para ${real ? "pessoa real" : "personagem"} (${subject.name})`);
      } else if (decision === "ALLOW_WITH_SOURCE") {
        const source = input.sourceId ?? subject.source_id;
        if (!source) reasons.push(`${claim} sobre pessoa real exige fonte (${subject.name})`);
      }
      if (real && input.integrityMode && claim.startsWith("SIMULATED_")) {
        reasons.push(`ElectionIntegrityMode ativo: ${claim} sobre pessoa real suspenso`);
      }
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

/**
 * Validação pós-renderização: o texto final não pode citar uma pessoa real que
 * não esteja entre os sujeitos autorizados, nem atribuir falas entre aspas a ela.
 */
export function validateRenderedText(
  originalText: string,
  realPersons: Array<{ name: string }>,
  authorized: Array<{ name: string }>,
): PolicyResult {
  const reasons: string[] = [];
  const allowedNames = new Set(authorized.map((p) => p.name));
  const quoteText = originalText;
  let text = originalText;
  // Nomes autorizados saem do texto antes da checagem (evita falso positivo de nome contido em outro)
  for (const name of [...allowedNames].sort((a, b) => b.length - a.length)) text = text.split(name).join(" ");
  for (const p of realPersons) {
    // Nomes de urna de uma palavra ("Igor", "Hugo") colidem com palavras e nomes comuns;
    // a validação textual só é confiável para nomes compostos.
    if (p.name.trim().split(/\s+/).length < 2) continue;
    if (!allowedNames.has(p.name) && new RegExp(`(^|[^\\p{L}])${escapeRegExp(p.name)}($|[^\\p{L}])`, "u").test(text)) {
      reasons.push(`Texto cita pessoa real não autorizada: ${p.name}`);
    }
    if (allowedNames.has(p.name)) {
      const quoteNearName = new RegExp(`${escapeRegExp(p.name)}[^.]{0,80}["“”]`);
      if (quoteNearName.test(quoteText)) reasons.push(`Fala entre aspas atribuída a pessoa real: ${p.name}`);
    }
  }
  return { allowed: reasons.length === 0, reasons };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pacote fechado de fatos e permissões entregue a qualquer provider de narrativa (template ou LLM). */
export interface NarrativeFacts {
  fictionalUniverse: true;
  facts: Record<string, string | number>;
  realPersons: string[];
  allowedClaims: ClaimType[];
  forbiddenClaims: ClaimType[];
}

export function buildNarrativeFacts(
  facts: Record<string, string | number>,
  subjects: PolicySubject[],
  claims: ClaimType[],
): NarrativeFacts {
  const real = subjects.filter((s) => isReal(s.kind));
  const allClaims = Object.keys(CONTENT_POLICY) as ClaimType[];
  const forbidden = real.length
    ? allClaims.filter((c) => CONTENT_POLICY[c].real === "BLOCK")
    : allClaims.filter((c) => CONTENT_POLICY[c].fictional === "BLOCK");
  return {
    fictionalUniverse: true,
    facts,
    realPersons: real.map((r) => r.name),
    allowedClaims: claims.filter((c) => !forbidden.includes(c)),
    forbiddenClaims: forbidden,
  };
}
