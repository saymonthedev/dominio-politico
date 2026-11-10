/**
 * Avatar do personagem: um código curto ("av1-" + 8 caracteres, um por parte) guardado com a vida do
 * personagem. Serve no servidor e no navegador (sem React). Quem nunca montou o seu ganha um avatar
 * sorteado a partir do id do personagem: cada jogador começa diferente.
 */

export interface AvatarPart {
  key: AvatarKey;
  label: string;
  options: Array<{ label: string; color?: string }>;
}

export type AvatarKey = "skin" | "hair" | "hairColor" | "facial" | "glasses" | "top" | "topColor" | "bg";
export type AvatarSpec = Record<AvatarKey, number>;

export const SKIN = ["#f6d7c3", "#eac09f", "#d6a27c", "#b97c55", "#8d5a3b", "#5e3b26"];
export const HAIR_COLOR = ["#1f1b18", "#3b2a20", "#6b4a2f", "#c9a35b", "#a5532a", "#9aa0a6", "#e6e2da"];
export const TOP_COLOR = ["#1f2a44", "#2b2f36", "#5b6472", "#f4f1ea", "#8a1c1c", "#1f6b4a", "#c49a2c", "#3d5a99"];
export const BG = ["#dfe9f3", "#f4d58d", "#e3f1e8", "#fbe6e3", "#e8eaf8", "#ebe4d4", "#0b1f3a", "#1f6b4a"];

export const AVATAR_PARTS: AvatarPart[] = [
  { key: "skin", label: "Pele", options: SKIN.map((color, i) => ({ label: `Tom ${i + 1}`, color })) },
  {
    key: "hair",
    label: "Cabelo",
    options: [{ label: "Curto" }, { label: "Raspado" }, { label: "Calvo" }, { label: "De lado" }, { label: "Cacheado" }, { label: "Longo" }, { label: "Coque" }, { label: "Black power" }],
  },
  {
    key: "hairColor",
    label: "Cor do cabelo",
    options: ["Preto", "Castanho-escuro", "Castanho", "Loiro", "Ruivo", "Grisalho", "Branco"].map((label, i) => ({ label, color: HAIR_COLOR[i] })),
  },
  { key: "facial", label: "Barba", options: [{ label: "Sem barba" }, { label: "Barba cheia" }, { label: "Bigode" }, { label: "Cavanhaque" }, { label: "Por fazer" }] },
  { key: "glasses", label: "Óculos", options: [{ label: "Sem óculos" }, { label: "Redondos" }, { label: "Quadrados" }] },
  { key: "top", label: "Roupa", options: [{ label: "Terno e gravata" }, { label: "Terno sem gravata" }, { label: "Camisa social" }, { label: "Camiseta" }, { label: "Gola alta" }] },
  {
    key: "topColor",
    label: "Cor da roupa",
    options: ["Marinho", "Grafite", "Cinza", "Branco", "Vinho", "Verde", "Mostarda", "Azul"].map((label, i) => ({ label, color: TOP_COLOR[i] })),
  },
  { key: "bg", label: "Fundo", options: ["Céu", "Dourado", "Mata", "Rosa", "Lilás", "Areia", "Planalto", "Verde"].map((label, i) => ({ label, color: BG[i] })) },
];

const ORDER: AvatarKey[] = ["skin", "hair", "hairColor", "facial", "glasses", "top", "topColor", "bg"];
const SIZE: Record<AvatarKey, number> = Object.fromEntries(AVATAR_PARTS.map((p) => [p.key, p.options.length])) as Record<AvatarKey, number>;

export function avatarCode(spec: AvatarSpec): string {
  return `av1-${ORDER.map((k) => Math.max(0, Math.min(SIZE[k] - 1, Math.round(spec[k] ?? 0))).toString(36)).join("")}`;
}

/** Lê um código de avatar; null se não for um código válido. */
export function parseAvatar(code: string | null | undefined): AvatarSpec | null {
  if (!code || !/^av1-[0-9a-z]{8}$/.test(code)) return null;
  const spec = {} as AvatarSpec;
  for (let i = 0; i < ORDER.length; i++) {
    const v = parseInt(code[4 + i], 36);
    if (!(v >= 0 && v < SIZE[ORDER[i]])) return null;
    spec[ORDER[i]] = v;
  }
  return spec;
}

export const isAvatarCode = (code: unknown): code is string => typeof code === "string" && parseAvatar(code) !== null;

/** Avatar sorteado (estável) a partir de um texto, como o id do personagem. */
export function defaultAvatar(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return (h ^= h >>> 16) >>> 0;
  };
  const pick = (k: AvatarKey) => next() % SIZE[k];
  const spec = Object.fromEntries(ORDER.map((k) => [k, pick(k)])) as AvatarSpec;
  // ternos e fundos claros com mais frequência; óculos e barba em parte dos personagens
  if (next() % 3) spec.top = next() % 2;
  if (next() % 2) spec.bg = next() % 6;
  if (next() % 3) spec.glasses = 0;
  if (next() % 2) spec.facial = 0;
  return avatarCode(spec);
}

export function randomAvatar(): string {
  return defaultAvatar(`${Date.now()}-${Math.random()}`);
}
