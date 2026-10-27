import { ideologyDistance, type Ideology } from "./ideology";
import { SEGMENT_BY_KEY } from "./segments";
import type { VoterSegmentRow } from "./types";

/**
 * Modelo de apoio eleitoral por segmentos agregados.
 * apoio = distância ideológica + avaliação econômica/governo + reputação +
 *         reconhecimento + partido + desempenho/incumbência + campanha − escândalos + ruído
 * As constantes ficam aqui (e podem ser sobrescritas) para balanceamento.
 */
export const SUPPORT_PARAMS = {
  ideology: 8,
  reputation: 1.0,
  recognition: 1.8,
  party: 1.4,
  government: 1.1,
  incumbent: 0.35,
  momentum: 0.6,
  scandal: 2.5,
  invalidUtility: -1.6,
  unknownPenalty: 0.9,
};

export interface Contender {
  id: string;
  ideology: Ideology;
  /** 0–100 */
  reputation: number;
  /** reconhecimento do nome na UF, 0–1 */
  recognition: number;
  /** força da legenda na UF, 0–1 */
  partyStrength: number;
  /** -1 oposição, 0 independente, +1 base do governo federal */
  govAlignment: number;
  incumbent: boolean;
  momentum: number;
  /** 0–100 */
  scandal: number;
  /** ruído latente fixo da disputa */
  noise: number;
}

export interface ShareResult {
  shares: Map<string, number>;
  invalidShare: number;
  turnout: number;
}

/** approval: 0–100 aprovação federal; econMood: -1..1 */
export function segmentUtility(seg: VoterSegmentRow, c: Contender, approval: number, econMood: number): number {
  const p = SUPPORT_PARAMS;
  const salience = SEGMENT_BY_KEY[seg.segment]?.salience ?? {};
  const dist = ideologyDistance(seg.ideology, c.ideology, salience);
  const govEval = ((approval - 50) / 50) * 0.7 + econMood * 0.3;
  return (
    -p.ideology * dist +
    p.reputation * ((c.reputation - 50) / 50) +
    p.recognition * c.recognition -
    p.unknownPenalty * (1 - Math.min(1, c.recognition * 2.5)) +
    p.party * c.partyStrength +
    p.government * c.govAlignment * govEval * seg.econ_sensitivity +
    (c.incumbent ? p.incumbent : 0) +
    p.momentum * c.momentum -
    p.scandal * (c.scandal / 100) +
    c.noise +
    (c.incumbent ? seg.mood * 0.5 : 0)
  );
}

/** Divide os votos de uma UF entre os contendores (fração dos válidos). */
export function ufShares(
  segments: VoterSegmentRow[],
  contenders: Contender[],
  approval: number,
  econMood: number,
): ShareResult {
  const totals = new Map<string, number>(contenders.map((c) => [c.id, 0]));
  let invalid = 0;
  let turnout = 0;
  for (const seg of segments) {
    const utils = contenders.map((c) => segmentUtility(seg, c, approval, econMood));
    const max = Math.max(...utils, SUPPORT_PARAMS.invalidUtility);
    const exps = utils.map((u) => Math.exp(u - max));
    const invExp = Math.exp(SUPPORT_PARAMS.invalidUtility - max);
    const sum = exps.reduce((a, b) => a + b, 0) + invExp;
    const w = seg.weight * seg.turnout;
    turnout += w;
    contenders.forEach((c, i) => totals.set(c.id, (totals.get(c.id) ?? 0) + (w * exps[i]) / sum));
    invalid += (w * invExp) / sum;
  }
  const validTotal = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  const shares = new Map<string, number>();
  for (const [id, v] of totals) shares.set(id, v / validTotal);
  return { shares, invalidShare: invalid / (turnout || 1), turnout };
}
