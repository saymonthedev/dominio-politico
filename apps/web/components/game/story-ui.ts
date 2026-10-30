import type { StoryKind, StoryTag } from "@dp/engine";

/** Rótulos e ícones dos acontecimentos da carreira (compartilhados pelas telas). */
export const KIND: Record<StoryKind, { label: string; icon: string; tone: string; means: string }> = {
  DECISAO: { label: "Decisão", icon: "alert", tone: "decisao", means: "o tempo só segue depois da sua escolha" },
  OPORTUNIDADE: { label: "Oportunidade", icon: "star", tone: "oportunidade", means: "responda quando quiser, até o prazo" },
  INFO: { label: "Informativo", icon: "info", tone: "info", means: "só para você saber" },
};

/** Explicação curta do que são os acontecimentos (para quem está começando). */
export const STORY_INTRO =
  "Acontecimentos são a vida da sua carreira acontecendo: convites, crises, propostas, cobranças. Você escolhe como reagir, e cada escolha muda algo no personagem, às vezes só semanas depois.";

export const TAG: Record<StoryTag, { label: string; icon: string }> = {
  VIDA: { label: "Vida", icon: "home" },
  TRABALHO: { label: "Trabalho", icon: "briefcase" },
  COMUNIDADE: { label: "Comunidade", icon: "users" },
  PARTIDO: { label: "Partido", icon: "flag" },
  FILIACAO: { label: "Filiação", icon: "file" },
  CAMPANHA: { label: "Campanha", icon: "megaphone" },
  DEBATE: { label: "Debate", icon: "users" },
  ELEICAO: { label: "Eleição", icon: "ballot" },
  MANDATO: { label: "Mandato", icon: "landmark" },
  BASTIDORES: { label: "Bastidores", icon: "eye" },
  IMPRENSA: { label: "Imprensa", icon: "newspaper" },
  SAUDE: { label: "Saúde", icon: "bolt" },
  DINHEIRO: { label: "Dinheiro", icon: "coins" },
};

export const TONE_LABEL: Record<string, string> = {
  safe: "prudente",
  bold: "ousada",
  risky: "arriscada",
  illegal: "ilegal",
  neutral: "",
};

const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const dayShort = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};

export const dateLong = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/** Dias entre duas datas ISO (b − a). */
export const daysUntil = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export function deadline(today: string | undefined, expires: string | null): string | null {
  if (!expires) return null;
  if (!today) return `até ${dayShort(expires)}`;
  const n = daysUntil(today, expires);
  if (n < 0) return "prazo vencido";
  if (n === 0) return "responda hoje";
  return n === 1 ? "responda até amanhã" : `responda em até ${n} dias`;
}

export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

const SEEN_KEY = "dp:eventos-vistos";

/** Acontecimentos já mostrados nesta sessão: não abrem sozinhos de novo. */
export function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function markSeen(id: string) {
  try {
    const s = seenSet();
    s.add(id);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-60)));
  } catch {
    /* sessão sem armazenamento: só não lembra */
  }
}
