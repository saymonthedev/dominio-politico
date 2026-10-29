import { makeIdeology, type Ideology } from "./ideology";
import type { EntryCulture } from "./types";

/**
 * Perfis de jogo dos partidos reais, por sigla (e época, quando a mesma sigla
 * mudou de perfil — ex.: o PL de centro de 2002 e o PL de direita pós-2019).
 *
 * Nome, sigla, número, federação, coligações e bancadas vêm dos snapshots
 * oficiais do TSE (data/snapshot-<ano>.json). Já a posição nos 6 eixos, a
 * cultura de entrada e a disciplina são CALIBRAÇÃO EDITORIAL DO JOGO —
 * aproximações ajustáveis, não classificação oficial.
 * Ver docs/adr/0004-mundo-real-e-limites.md.
 *
 * Integridade: todos os partidos começam com a MESMA integridade (0,5). Se uma
 * legenda fica "suja" ao longo da partida, é pelo que personagens procedurais e
 * jogadores fizeram dentro dela — nunca por rótulo prévio.
 *
 * Logos/símbolos não são usados (Lei 9.096/95): apenas sigla e cor.
 */
export interface PartyProfile {
  ideology: Ideology;
  entry: EntryCulture;
  discipline: number;
  color: string;
}

type Raw = [number[], EntryCulture, number, string];

const RAW: Record<string, Raw> = {
  PSTU: [[-95, -70, -70, -60, 30, -20], "RELACIONAMENTO", 0.9, "#991b1b"],
  PCO: [[-95, -40, -60, -30, -10, -30], "RELACIONAMENTO", 0.9, "#7f1d1d"],
  PCB: [[-90, -60, -60, -40, 20, -30], "RELACIONAMENTO", 0.9, "#b91c1c"],
  UP: [[-85, -65, -65, -50, 30, -20], "RELACIONAMENTO", 0.9, "#dc2626"],
  PSOL: [[-75, -80, -70, -50, 60, -10], "RELACIONAMENTO", 0.8, "#a21caf"],
  REDE: [[-35, -60, -50, -50, 85, 10], "ABERTO", 0.7, "#0d9488"],
  PCDOB: [[-70, -45, -40, -10, -20, -30], "RELACIONAMENTO", 0.85, "#be123c"],
  PT: [[-60, -45, -40, -15, 10, -30], "RELACIONAMENTO", 0.8, "#dc2626"],
  PPL: [[-60, -25, -20, -10, -10, -20], "ABERTO", 0.7, "#b45309"],
  PV: [[-30, -45, -30, -30, 80, 10], "ABERTO", 0.6, "#16a34a"],
  PDT: [[-50, -25, -15, 0, -10, -20], "ABERTO", 0.6, "#e11d48"],
  PSB: [[-35, -30, -20, -10, 15, -10], "ABERTO", 0.65, "#ea580c"],
  PGT: [[-20, 10, 10, 0, -5, 0], "ABERTO", 0.5, "#64748b"],
  PMN: [[-10, 10, 10, 0, -5, 10], "ABERTO", 0.5, "#b91c1c"],
  PPS: [[-10, -20, -5, -5, 20, 0], "ABERTO", 0.55, "#db2777"],
  CIDADANIA: [[10, -20, -5, -10, 30, 10], "ABERTO", 0.55, "#db2777"],
  PROS: [[0, 20, 20, 5, -10, 10], "ABERTO", 0.45, "#ea580c"],
  SOLIDARIEDADE: [[-10, 15, 20, 0, -15, 10], "ABERTO", 0.5, "#f59e0b"],
  PSDB: [[30, 0, 15, -5, 10, 15], "ABERTO", 0.55, "#2563eb"],
  MDB: [[20, 15, 20, 0, -20, 30], "ABERTO", 0.45, "#16a34a"],
  PSD: [[25, 20, 25, 0, -25, 30], "ABERTO", 0.45, "#0369a1"],
  AVANTE: [[15, 25, 25, 5, -20, 20], "ABERTO", 0.5, "#f97316"],
  PST: [[20, 20, 20, 0, -10, 15], "ABERTO", 0.45, "#64748b"],
  PAN: [[10, 30, 30, 5, -10, 15], "ABERTO", 0.45, "#64748b"],
  PL_CENTRO: [[20, 35, 30, 5, -20, 20], "ABERTO", 0.45, "#1e3a8a"],
  PTB: [[20, 40, 40, 10, -20, 15], "ABERTO", 0.5, "#0f172a"],
  PODE: [[35, 30, 35, 5, -20, 25], "ABERTO", 0.5, "#16a34a"],
  MOBILIZA: [[20, 35, 30, 10, -15, 15], "ABERTO", 0.5, "#b45309"],
  PHS: [[20, 45, 40, 5, -15, 15], "ABERTO", 0.5, "#0e7490"],
  PRP: [[20, 45, 40, 10, -15, 15], "ABERTO", 0.5, "#1d4ed8"],
  PTC: [[20, 50, 45, 10, -15, 15], "ABERTO", 0.5, "#1e40af"],
  AGIR: [[35, 40, 40, 10, -20, 20], "ABERTO", 0.5, "#7c3aed"],
  PRD: [[30, 45, 45, 15, -25, 15], "ABERTO", 0.5, "#1e3a8a"],
  DC: [[25, 60, 45, 10, -15, 15], "ABERTO", 0.55, "#0e7490"],
  DEMOCRATA: [[30, 35, 35, 5, -15, 20], "ABERTO", 0.5, "#9333ea"],
  PSC: [[30, 70, 55, 15, -20, 15], "RELACIONAMENTO", 0.6, "#15803d"],
  PP: [[45, 45, 45, 10, -35, 30], "RELACIONAMENTO", 0.55, "#1d4ed8"],
  DEM: [[50, 40, 45, 5, -30, 35], "RELACIONAMENTO", 0.55, "#1e40af"],
  UNIAO: [[45, 35, 45, 5, -30, 35], "RELACIONAMENTO", 0.5, "#1e40af"],
  REPUBLICANOS: [[35, 65, 55, 15, -25, 20], "RELACIONAMENTO", 0.7, "#0284c7"],
  PATRIOTA: [[45, 65, 70, 25, -35, 20], "ABERTO", 0.6, "#15803d"],
  PSL_DIREITA: [[70, 65, 75, 25, -40, 30], "ABERTO", 0.5, "#16a34a"],
  PSL_LIBERAL: [[50, 30, 35, 0, -15, 25], "ABERTO", 0.5, "#16a34a"],
  PL: [[55, 70, 75, 30, -45, 25], "CONVITE", 0.75, "#1d4ed8"],
  NOVO: [[90, 15, 40, -30, -5, 60], "ABERTO", 0.85, "#ea580c"],
  MISSAO: [[85, 10, 45, -20, -10, 50], "ABERTO", 0.8, "#facc15"],
  PRTB: [[60, 70, 75, 35, -40, 20], "ABERTO", 0.6, "#15803d"],
  PRONA: [[-20, 75, 85, 60, -30, -40], "RELACIONAMENTO", 0.8, "#166534"],
};

/** Siglas equivalentes (renomeações) para o mesmo perfil. */
const SAME_PROFILE: Record<string, string> = {
  PMDB: "MDB",
  PFL: "DEM",
  PPB: "PP",
  "PC DO B": "PCDOB",
  PCDOB: "PCDOB",
  "PT DO B": "AVANTE",
  PTDOB: "AVANTE",
  PSDC: "DC",
  SD: "SOLIDARIEDADE",
  PTN: "PODE",
  PEN: "PATRIOTA",
  PATRI: "PATRIOTA",
  PRB: "REPUBLICANOS",
  PMB: "DEMOCRATA",
  "UNIÃO": "UNIAO",
  "MISSÃO": "MISSAO",
  PR: "PL_CENTRO",
};

export function normAcronym(acr: string): string {
  return acr.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function key(acronym: string, year: number): string {
  const a = normAcronym(acronym);
  if (a === "PL") return year < 2019 ? "PL_CENTRO" : "PL";
  if (a === "PSL") return year >= 2018 ? "PSL_DIREITA" : "PSL_LIBERAL";
  if (a === "PSD" && year < 2011) return "PST";
  return SAME_PROFILE[a] ?? SAME_PROFILE[acronym.toUpperCase()] ?? a;
}

export function profileFor(acronym: string, year: number): PartyProfile {
  const raw = RAW[key(acronym, year)];
  const [[economy, social, security, institutions, environment, federalism], entry, discipline, color] = raw ?? [[0, 0, 0, 0, 0, 0], "ABERTO", 0.5, "#64748b"];
  return { ideology: makeIdeology({ economy, social, security, institutions, environment, federalism }), entry, discipline, color };
}

/**
 * Sucessão de siglas entre eleições (incorporações, fusões e renomeações).
 * Só é aplicada quando a sigla antiga não existe no registro do ano do mundo.
 */
const SUCCESSION: Record<string, string[]> = {
  PMDB: ["MDB"],
  PFL: ["DEM", "UNIÃO"],
  DEM: ["UNIÃO"],
  PSL: ["UNIÃO"],
  PPB: ["PP"],
  PTN: ["PODE"],
  PSC: ["PODE"],
  PEN: ["PATRI", "PATRIOTA", "PRD"],
  PATRI: ["PATRIOTA", "PRD"],
  PATRIOTA: ["PRD"],
  PTB: ["PRD"],
  "PT do B": ["AVANTE"],
  PSDC: ["DC"],
  PPS: ["CIDADANIA"],
  PRB: ["REPUBLICANOS"],
  PR: ["PL"],
  PL: ["PR"],
  PRONA: ["PR"],
  SD: ["SOLIDARIEDADE"],
  PROS: ["SOLIDARIEDADE"],
  PHS: ["PODE"],
  PRP: ["PATRI", "PATRIOTA"],
  PPL: ["PCdoB", "PC do B", "PCDOB"],
  PMB: ["DEMOCRATA"],
  "PC do B": ["PCdoB", "PCDOB", "PC do B"],
  PCDOB: ["PC do B", "PCdoB"],
  PAN: ["PTB"],
  PST: ["PL"],
  PGT: ["PL"],
  PMN: ["MOBILIZA"],
  PSD: ["PTB"],
};

export function resolveAcronym(raw: string, available: Set<string>, visited: Set<string> = new Set()): string | null {
  if (available.has(raw)) return raw;
  if (visited.has(raw)) return null;
  visited.add(raw);
  const norm = normAcronym(raw).replace(/\s/g, "");
  for (const a of available) if (normAcronym(a).replace(/\s/g, "") === norm) return a;
  for (const cand of SUCCESSION[raw] ?? SUCCESSION[normAcronym(raw)] ?? []) {
    const r = resolveAcronym(cand, available, visited);
    if (r) return r;
  }
  return null;
}

export const ENTRY_CULTURE_LABEL: Record<EntryCulture, string> = {
  ABERTO: "Porta aberta: avalia afinidade e perfil",
  RELACIONAMENTO: "Exige relacionamento com lideranças e trajetória",
  CONVITE: "Na mecânica do jogo, só filia por convite de alguém de dentro",
};

/** Alas internas genéricas (procedurais), usadas para a disputa interna. */
export const FACTION_TEMPLATES: Array<{ name: string; offset: Partial<Ideology>; strength: number }> = [
  { name: "Ala Programática", offset: { economy: -8, social: -8 }, strength: 0.35 },
  { name: "Ala Pragmática", offset: { economy: 8, institutions: 8 }, strength: 0.45 },
  { name: "Ala Regionalista", offset: { federalism: 15 }, strength: 0.2 },
];

/** Todas as siglas reais que o jogo conhece (para que as siglas inventadas nunca coincidam com elas). */
export const KNOWN_ACRONYMS: ReadonlySet<string> = new Set(
  [...Object.keys(RAW), ...Object.keys(SAME_PROFILE), ...Object.values(SAME_PROFILE), ...Object.keys(SUCCESSION), ...Object.values(SUCCESSION).flat()].map((a) => normAcronym(a).replace(/\s/g, "")),
);
