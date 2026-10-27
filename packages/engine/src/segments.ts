import { UFS, type Region } from "./geo";
import { jitter, makeIdeology, type Ideology, type Salience } from "./ideology";
import type { Rng } from "./rng";

/**
 * Eleitorado em segmentos agregados (nunca um agente por eleitor).
 * Pesos regionais são calibração de jogo, não pesquisa de opinião.
 */
export interface SegmentDef {
  key: string;
  label: string;
  ideology: Ideology;
  salience: Salience;
  turnout: number;
  econSensitivity: number;
  baseWeight: number;
  regional: Partial<Record<Region, number>>;
}

export const SEGMENTS: SegmentDef[] = [
  {
    key: "jovens_urbanos",
    label: "Jovens urbanos",
    ideology: makeIdeology({ economy: -15, social: -45, security: -25, institutions: -20, environment: 40, federalism: 0 }),
    salience: { social: 1.4, environment: 1.2 },
    turnout: 0.72,
    econSensitivity: 0.8,
    baseWeight: 0.14,
    regional: { SE: 0.02, S: 0.01 },
  },
  {
    key: "classe_media",
    label: "Classe média urbana",
    ideology: makeIdeology({ economy: 30, social: 10, security: 30, institutions: 0, environment: 10, federalism: 15 }),
    salience: { economy: 1.3, security: 1.2 },
    turnout: 0.82,
    econSensitivity: 1.1,
    baseWeight: 0.18,
    regional: { SE: 0.04, S: 0.04, NE: -0.04 },
  },
  {
    key: "trabalhadores_formais",
    label: "Trabalhadores formais",
    ideology: makeIdeology({ economy: -30, social: 15, security: 25, institutions: 5, environment: -10, federalism: -5 }),
    salience: { economy: 1.5 },
    turnout: 0.8,
    econSensitivity: 1.3,
    baseWeight: 0.18,
    regional: { SE: 0.02, S: 0.02, N: -0.02 },
  },
  {
    key: "informais",
    label: "Trabalhadores informais e baixa renda",
    ideology: makeIdeology({ economy: -50, social: 25, security: 35, institutions: 10, environment: -15, federalism: -20 }),
    salience: { economy: 1.6, security: 1.1 },
    turnout: 0.74,
    econSensitivity: 1.5,
    baseWeight: 0.2,
    regional: { NE: 0.08, N: 0.06, S: -0.05, SE: -0.03 },
  },
  {
    key: "evangelicos",
    label: "Evangélicos conservadores",
    ideology: makeIdeology({ economy: 10, social: 70, security: 55, institutions: 25, environment: -15, federalism: 5 }),
    salience: { social: 1.7, security: 1.2 },
    turnout: 0.84,
    econSensitivity: 0.9,
    baseWeight: 0.12,
    regional: { N: 0.04, CO: 0.03, SE: 0.01 },
  },
  {
    key: "agro",
    label: "Interior e agronegócio",
    ideology: makeIdeology({ economy: 45, social: 45, security: 50, institutions: 20, environment: -55, federalism: 45 }),
    salience: { environment: 1.4, federalism: 1.3, economy: 1.1 },
    turnout: 0.83,
    econSensitivity: 1.0,
    baseWeight: 0.08,
    regional: { CO: 0.1, S: 0.05, N: 0.02, NE: -0.02, SE: -0.03 },
  },
  {
    key: "aposentados",
    label: "Aposentados e idosos",
    ideology: makeIdeology({ economy: -20, social: 35, security: 40, institutions: 10, environment: 0, federalism: -10 }),
    salience: { economy: 1.3, security: 1.1 },
    turnout: 0.78,
    econSensitivity: 1.2,
    baseWeight: 0.1,
    regional: { S: 0.02, SE: 0.01 },
  },
];

export const SEGMENT_BY_KEY: Record<string, SegmentDef> = Object.fromEntries(SEGMENTS.map((s) => [s.key, s]));

const REGION_SHIFT: Record<Region, Partial<Ideology>> = {
  N: { environment: -10, social: 10 },
  NE: { economy: -15, social: 5 },
  CO: { economy: 10, social: 10, environment: -15 },
  SE: { economy: 5 },
  S: { economy: 10, social: 5, security: 5 },
};

export interface GeneratedSegment {
  uf: string;
  segment: string;
  weight: number;
  ideology: Ideology;
  turnout: number;
  econ_sensitivity: number;
}

export function generateSegments(rng: Rng): GeneratedSegment[] {
  const out: GeneratedSegment[] = [];
  for (const uf of UFS) {
    const raw = SEGMENTS.map((s) => Math.max(0.02, s.baseWeight + (s.regional[uf.region] ?? 0) + rng.normal(0, 0.01)));
    const total = raw.reduce((a, b) => a + b, 0);
    SEGMENTS.forEach((s, i) => {
      const shift = REGION_SHIFT[uf.region];
      const base = makeIdeology({
        economy: s.ideology.economy + (shift.economy ?? 0),
        social: s.ideology.social + (shift.social ?? 0),
        security: s.ideology.security + (shift.security ?? 0),
        institutions: s.ideology.institutions,
        environment: s.ideology.environment + (shift.environment ?? 0),
        federalism: s.ideology.federalism,
      });
      out.push({
        uf: uf.code,
        segment: s.key,
        weight: raw[i] / total,
        ideology: jitter(base, rng, 6),
        turnout: Math.min(0.92, Math.max(0.6, s.turnout + rng.normal(0, 0.02))),
        econ_sensitivity: s.econSensitivity,
      });
    });
  }
  return out;
}
