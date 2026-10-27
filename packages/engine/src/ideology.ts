import type { Rng } from "./rng";

/**
 * Seis dimensões de -100 a +100 (documento técnico, seção "Espectro político").
 * O valor negativo é o primeiro extremo; o positivo, o segundo.
 */
export const AXES = ["economy", "social", "security", "institutions", "environment", "federalism"] as const;
export type Axis = (typeof AXES)[number];
export type Ideology = Record<Axis, number>;

export const AXIS_INFO: Record<Axis, { label: string; neg: string; pos: string }> = {
  economy: { label: "Economia", neg: "maior intervenção estatal", pos: "maior orientação a mercado" },
  social: { label: "Costumes", neg: "progressista", pos: "conservador" },
  security: { label: "Segurança", neg: "garantista", pos: "punitivista" },
  institutions: { label: "Instituições", neg: "participativo/descentralizado", pos: "executivo/centralizador" },
  environment: { label: "Meio ambiente", neg: "desenvolvimentista", pos: "ambientalista" },
  federalism: { label: "Federalismo", neg: "centralizador", pos: "maior autonomia subnacional" },
};

export function clampAxis(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)));
}

export function makeIdeology(partial: Partial<Ideology> = {}): Ideology {
  const out = {} as Ideology;
  for (const a of AXES) out[a] = clampAxis(partial[a] ?? 0);
  return out;
}

export type Salience = Partial<Record<Axis, number>>;

/** Distância euclidiana ponderada normalizada para [0, 1]. */
export function ideologyDistance(a: Ideology, b: Ideology, salience: Salience = {}): number {
  let sum = 0;
  let wsum = 0;
  for (const ax of AXES) {
    const w = salience[ax] ?? 1;
    const d = (a[ax] - b[ax]) / 200;
    sum += w * d * d;
    wsum += w;
  }
  return Math.sqrt(sum / (wsum || 1));
}

/** 1 = idêntico, 0 = oposto. */
export function ideologyAffinity(a: Ideology, b: Ideology, salience: Salience = {}): number {
  return 1 - ideologyDistance(a, b, salience);
}

export function blend(a: Ideology, b: Ideology, t: number): Ideology {
  const out = {} as Ideology;
  for (const ax of AXES) out[ax] = clampAxis(a[ax] * (1 - t) + b[ax] * t);
  return out;
}

export function jitter(base: Ideology, rng: Rng, sd: number): Ideology {
  const out = {} as Ideology;
  for (const ax of AXES) out[ax] = clampAxis(base[ax] + rng.normal(0, sd));
  return out;
}

export function weightedMean(items: Array<{ ideology: Ideology; weight: number }>): Ideology {
  const out = makeIdeology();
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  for (const ax of AXES) {
    out[ax] = clampAxis(items.reduce((s, i) => s + i.ideology[ax] * i.weight, 0) / total);
  }
  return out;
}

/** Rótulo curto da posição em um eixo, para a interface e as notícias. */
export function axisPosition(ax: Axis, v: number): string {
  const info = AXIS_INFO[ax];
  if (Math.abs(v) < 15) return "centro";
  const side = v < 0 ? info.neg : info.pos;
  return Math.abs(v) > 60 ? `fortemente ${side}` : side;
}

/** Rótulo geral simplificado (apenas descritivo — o jogo nunca reduz a um eixo para calcular). */
export function spectrumLabel(i: Ideology): string {
  const score = i.economy * 0.45 + i.social * 0.35 + i.security * 0.2;
  if (score < -55) return "esquerda";
  if (score < -20) return "centro-esquerda";
  if (score <= 20) return "centro";
  if (score <= 55) return "centro-direita";
  return "direita";
}
