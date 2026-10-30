import { diffDays } from "../calendar";
import { contenderFor, playerListStrength, tallyMajoritarian, ufOfGeo } from "../elections";
import { getUF } from "../geo";
import { rngFor } from "../rng";
import { OFFICES } from "../ruleset";
import { SEGMENT_BY_KEY, SEGMENTS } from "../segments";
import type { Ctx } from "../state";
import { segmentUtility, ufShares, type Contender } from "../support";
import type { CandidacyRow, PartyRow, PersonRow, RaceRow, VoterSegmentRow } from "../types";
import { scheduleStory } from "./state";
import { canAct } from "./world";

/**
 * Camada de campanha: estratégia (segmentos priorizados e tom), apoio por
 * segmento de eleitores, pesquisas com explicação, projeção de votos para
 * cargos proporcionais e adversários com personalidade que também agem.
 */

export const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.key, s.label]));

export function segLabel(key: string): string {
  return SEGMENT_BY_KEY[key]?.label ?? key;
}

export function raceUf(c: CandidacyRow): string {
  return c.geo === "BR" ? "SP" : ufOfGeo(c.geo);
}

export function segmentsIn(ctx: Ctx, uf: string): VoterSegmentRow[] {
  return [...ctx.t.voter_segments.values()].filter((s) => s.uf === uf).sort((a, b) => b.weight - a.weight);
}

export interface SegmentStanding {
  segment: string;
  label: string;
  weight: number;
  /** fatia estimada do candidato no segmento (0..1) */
  mine: number;
  /** maior fatia de um adversário no segmento */
  rival: number;
  rivalName: string | null;
  /** apoio conquistado com a campanha (-1..1) */
  bonus: number;
}

/** Retrato do eleitorado da disputa: onde a candidatura é forte e onde é fraca. */
export function segmentStandings(ctx: Ctx, cand: CandidacyRow): SegmentStanding[] {
  const uf = raceUf(cand);
  const race = ctx.t.races.get(cand.race_id);
  const segs = segmentsIn(ctx, uf);
  const approval = ctx.world.gov.approval;
  const econ = ctx.s.economy.gdp_growth / 4 - (ctx.s.economy.unemployment - 7) / 10;
  if (race && OFFICES[race.office_code].system === "MAJORITARIO") {
    const cands = [...ctx.t.candidacies.values()].filter((x) => x.race_id === race.id && (x.status === cand.status || x.status === "HOMOLOGADA" || x.status === "SEGUNDO_TURNO"));
    const contenders = cands.map((x) => contenderFor(ctx, x, uf));
    return segs.map((sg) => {
      const utils = contenders.map((ct) => segmentUtility(sg, ct, approval, econ));
      const max = Math.max(...utils);
      const exps = utils.map((u) => Math.exp(u - max));
      const sum = exps.reduce((a, b) => a + b, 0) || 1;
      const shares = exps.map((e) => e / sum);
      const myIdx = cands.findIndex((x) => x.id === cand.id);
      let rival = 0;
      let rivalName: string | null = null;
      shares.forEach((v, i) => {
        if (i !== myIdx && v > rival) {
          rival = v;
          rivalName = ctx.person(cands[i].person_id)?.name ?? null;
        }
      });
      return { segment: sg.segment, label: segLabel(sg.segment), weight: sg.weight, mine: shares[myIdx] ?? 0, rival, rivalName, bonus: cand.campaign.seg?.[sg.segment] ?? 0 };
    });
  }
  // proporcional: afinidade relativa com cada segmento (sem adversário direto)
  const ct = contenderFor(ctx, cand, uf);
  const utils = segs.map((sg) => segmentUtility(sg, ct, approval, econ));
  const mean = utils.reduce((a, b) => a + b, 0) / (utils.length || 1);
  return segs.map((sg, i) => ({
    segment: sg.segment,
    label: segLabel(sg.segment),
    weight: sg.weight,
    mine: Math.max(0.02, Math.min(0.95, 0.5 + (utils[i] - mean) * 0.25)),
    rival: 0.5,
    rivalName: null,
    bonus: cand.campaign.seg?.[sg.segment] ?? 0,
  }));
}

/** Segmentos onde a candidatura vai pior (para eventos de "virar o jogo"). */
export function weakSegments(ctx: Ctx, cand: CandidacyRow, n = 2): SegmentStanding[] {
  return segmentStandings(ctx, cand)
    .filter((s) => s.weight > 0.06)
    .sort((a, b) => a.mine - a.rival - (b.mine - b.rival))
    .slice(0, n);
}

export function strongSegments(ctx: Ctx, cand: CandidacyRow, n = 2): SegmentStanding[] {
  return segmentStandings(ctx, cand)
    .filter((s) => s.weight > 0.06)
    .sort((a, b) => b.mine - b.rival - (a.mine - a.rival))
    .slice(0, n);
}

export interface RivalView {
  cand: CandidacyRow;
  person: PersonRow;
  party: PartyRow | undefined;
  pct: number | null;
}

/** Principal adversário numa disputa majoritária (pela última pesquisa, ou pela apuração simulada). */
export function mainRival(ctx: Ctx, cand: CandidacyRow): RivalView | null {
  const race = ctx.t.races.get(cand.race_id);
  if (!race || OFFICES[race.office_code].system !== "MAJORITARIO") return null;
  const cands = [...ctx.t.candidacies.values()].filter((x) => x.race_id === race.id && x.id !== cand.id && (x.status === "HOMOLOGADA" || x.status === "SEGUNDO_TURNO"));
  if (!cands.length) return null;
  const poll = race.latest_poll ?? {};
  let best = cands[0];
  let bestPct = poll[best.id] ?? -1;
  for (const x of cands) {
    const v = poll[x.id] ?? -1;
    if (v > bestPct) {
      best = x;
      bestPct = v;
    }
  }
  if (bestPct < 0) {
    const tally = tallyMajoritarian(ctx, race, [cand, ...cands]);
    best = cands.sort((a, b) => (tally.votes.get(b.id) ?? 0) - (tally.votes.get(a.id) ?? 0))[0];
    bestPct = Math.round(((tally.votes.get(best.id) ?? 0) / (tally.valid || 1)) * 1000) / 10;
  }
  const person = ctx.person(best.person_id);
  if (!person) return null;
  return { cand: best, person, party: ctx.t.parties.get(best.party_id), pct: bestPct >= 0 ? bestPct : null };
}

/** Explica o que mexeu na campanha desde a última pesquisa. */
export function explainShift(cand: CandidacyRow): { up: string[]; down: string[] } {
  const j = cand.campaign.journal ?? [];
  const by = new Map<string, number>();
  for (const e of j) by.set(e.cause, (by.get(e.cause) ?? 0) + e.delta);
  const sorted = [...by.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return {
    up: sorted.filter(([, v]) => v > 0.005).slice(0, 2).map(([k]) => k),
    down: sorted.filter(([, v]) => v < -0.005).slice(0, 2).map(([k]) => k),
  };
}

/**
 * Depois de uma rodada de pesquisas: quem é jogador recebe a pesquisa da
 * própria disputa como acontecimento, com a variação e o porquê.
 */
export function afterPolls(ctx: Ctx, races: RaceRow[]): void {
  for (const race of races) {
    const poll = race.latest_poll;
    if (!poll) continue;
    for (const cand of ctx.t.candidacies.values()) {
      if (cand.race_id !== race.id || !cand.is_player || !(cand.id in poll)) continue;
      const st = ctx.pstate(cand.person_id);
      if (!st) continue;
      const entries = Object.entries(poll).sort((a, b) => b[1] - a[1]);
      const pct = poll[cand.id];
      const rank = entries.findIndex(([id]) => id === cand.id) + 1;
      const [leaderId, leaderPct] = entries[0];
      const leaderOther = entries.find(([id]) => id !== cand.id) ?? entries[0];
      const prev = cand.campaign.last_poll;
      const change = prev ? Math.round((pct - prev.pct) * 10) / 10 : null;
      const why = explainShift(cand);
      const gap = Math.round((leaderOther[1] - pct) * 10) / 10;
      const worrying = (change !== null && change <= -2) || (rank >= 2 && gap >= 6 && (change === null || change <= 0.5));
      // uma pesquisa por vez pede decisão; as outras só informam (ninguém muda de estratégia toda semana)
      const lastAlarm = st.story?.seen["pesquisa_preocupante"]?.last;
      const recentAlarm = !!lastAlarm && diffDays(ctx.date, lastAlarm) < 12;
      scheduleStory(st, worrying && !recentAlarm ? "pesquisa_preocupante" : "pesquisa_divulgada", ctx.date, {
        race: race.id,
        pct,
        rank,
        change: change ?? 0,
        hasPrev: prev ? 1 : 0,
        leader: ctx.person(ctx.t.candidacies.get(leaderId)?.person_id)?.name ?? "",
        leaderPct,
        rival: ctx.t.candidacies.get(leaderOther[0])?.person_id ?? "",
        rivalPct: leaderOther[1],
        gap,
        up: why.up.join("|"),
        down: why.down.join("|"),
      });
      cand.campaign.last_poll = { on: ctx.date, pct, rank, leader: leaderId, leader_pct: leaderPct };
      cand.campaign.journal = [];
      ctx.save("candidacies", cand);
      ctx.save("person_states", st);
    }
  }
}

// ---------------------------------------------------------------------------
// Projeção para cargos proporcionais (vereador, deputados)
// ---------------------------------------------------------------------------

export interface ListProjection {
  low: number;
  high: number;
  mid: number;
  partySeats: number;
  /** votos estimados do último eleito da chapa */
  cutoff: number;
  /** posição estimada na lista do partido */
  position: number;
  chance: "alta" | "média" | "baixa" | "remota";
}

export function projectList(ctx: Ctx, cand: CandidacyRow): ListProjection | null {
  const race = ctx.t.races.get(cand.race_id);
  if (!race || OFFICES[race.office_code].system !== "PROPORCIONAL") return null;
  const uf = ufOfGeo(race.geo);
  const parties = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO" && (p.territory[uf] ?? 0) > 0.005);
  const playerCands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && c.status === "HOMOLOGADA");
  const contenders: Contender[] = parties.map((p) => {
    const boost = playerCands.filter((c) => c.party_id === p.id).reduce((s, c) => s + 0.05 + c.campaign.momentum * 0.1, 0);
    return {
      id: p.id,
      ideology: p.ideology,
      reputation: p.reputation,
      recognition: 0.3 + 0.7 * (p.territory[uf] ?? 0),
      partyStrength: (p.territory[uf] ?? 0) * 1.5,
      govAlignment: p.gov_alignment,
      incumbent: false,
      momentum: boost,
      scandal: (0.5 - p.integrity) * 60,
      noise: rngFor(ctx.world.seed, "latent-party", 0, `${race.id}:${p.id}`).normal(0, 0.25),
    };
  });
  const segs = [...ctx.t.voter_segments.values()].filter((s) => s.uf === uf);
  const res = ufShares(segs, contenders, ctx.world.gov.approval, 0);
  const valid = race.electorate * res.turnout * (1 - res.invalidShare);
  const partyVotes = valid * (res.shares.get(cand.party_id) ?? 0);
  const qe = valid / Math.max(1, race.seats);
  const partySeats = Math.max(0, Math.round(partyVotes / qe - 0.25));
  const mine = playerListStrength(ctx, race, cand, 0);
  const incumbents = [...ctx.t.persons.values()].filter((p) => p.party_id === cand.party_id && p.office_code === race.office_code && p.office_geo === race.geo && p.status === "ACTIVE" && p.id !== cand.person_id);
  const others = incumbents.map((p) => Math.exp(-0.2 + 2.2 * (ctx.pstate(p.id)?.reach[uf] ?? 0.2)));
  const listSize = Math.max(partySeats + 1, Math.min(race.seats + 1, Math.round(partySeats * 2.5 + 3)));
  while (others.length < listSize - 1) others.push(Math.exp(0.32));
  const total = mine + others.reduce((a, b) => a + b, 0);
  const mid = (partyVotes * 0.92 * mine) / (total || 1);
  const ranked = [...others.map((v) => (partyVotes * 0.92 * v) / total), mid].sort((a, b) => b - a);
  const position = ranked.indexOf(mid) + 1;
  const cutoff = partySeats > 0 ? ranked[Math.min(partySeats, ranked.length) - 1] : qe;
  const ratio = mid / (cutoff || 1);
  const chance = partySeats === 0 ? "remota" : ratio >= 1.25 ? "alta" : ratio >= 0.9 ? "média" : ratio >= 0.6 ? "baixa" : "remota";
  return { low: Math.round(mid * 0.75), high: Math.round(mid * 1.25), mid: Math.round(mid), partySeats, cutoff: Math.round(cutoff), position, chance };
}

// ---------------------------------------------------------------------------
// Adversários com personalidade
// ---------------------------------------------------------------------------

function personaOf(ctx: Ctx, cand: CandidacyRow): NonNullable<CandidacyRow["campaign"]["persona"]> {
  if (cand.campaign.persona) return cand.campaign.persona;
  const p = ctx.person(cand.person_id);
  const t = ctx.pstate(cand.person_id)?.traits;
  const incumbent = p?.office_code === cand.office_code;
  const persona = incumbent || (p?.tier ?? 3) <= 1 ? "VETERANA" : t && t.riskTolerance > 0.62 && t.ambition > 0.6 ? "AGRESSIVA" : t && t.charisma > 0.62 ? "POPULISTA" : t && t.competence > 0.62 ? "TECNICA" : (["AGRESSIVA", "POPULISTA", "TECNICA", "VETERANA"] as const)[Math.abs(cand.id.length * 7 + cand.ballot_number) % 4];
  cand.campaign.persona = persona;
  return persona;
}

export const PERSONA_LABEL: Record<string, string> = {
  AGRESSIVA: "agressiva: ataca quem cresce",
  POPULISTA: "populista: promete a cada grupo o que ele quer ouvir",
  TECNICA: "técnica: aposta em propostas e debates",
  VETERANA: "veterana: máquina, alianças e apoios",
};

/**
 * Adversários de jogadores fazem campanha de verdade: propaganda, promessas,
 * apoios e ataques. Só personagens fictícios atacam ou prometem; pessoas reais
 * apenas fazem campanha de forma neutra (sem falas ou ataques inventados).
 */
export function rivalsDaily(ctx: Ctx, electionId: string): void {
  const races = new Set<string>();
  for (const c of ctx.t.candidacies.values()) {
    if (c.election_id === electionId && c.is_player && (c.status === "HOMOLOGADA" || c.status === "SEGUNDO_TURNO")) races.add(c.race_id);
  }
  for (const raceId of races) {
    const race = ctx.t.races.get(raceId);
    if (!race || OFFICES[race.office_code].system !== "MAJORITARIO") continue;
    const e = ctx.t.elections.get(electionId);
    if (!e || ctx.date < e.calendar.campaignStart) continue;
    const cands = [...ctx.t.candidacies.values()].filter((x) => x.race_id === raceId && (e.status === "SEGUNDO_TURNO" ? x.status === "SEGUNDO_TURNO" : x.status === "HOMOLOGADA"));
    const players = cands.filter((x) => x.is_player);
    const poll = race.latest_poll ?? {};
    const daysLeft = diffDays(e.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round, ctx.date);
    for (const rc of cands) {
      if (rc.is_player) continue;
      const person = ctx.person(rc.person_id);
      if (!person) continue;
      const rng = ctx.rng("rival", rc.id);
      const tempo = daysLeft <= 14 ? 0.28 : 0.16;
      if (!rng.chance(tempo)) continue;
      const persona = personaOf(ctx, rc);
      const fictional = canAct(person);
      const leader = Object.entries(poll).sort((a, b) => b[1] - a[1])[0]?.[0];
      // alvo: o jogador mais bem colocado acima ou perto dele
      const target = players
        .filter((pc) => (poll[pc.id] ?? 0) >= (poll[rc.id] ?? 0) - 5)
        .sort((a, b) => (poll[b.id] ?? 0) - (poll[a.id] ?? 0))[0];
      const roll = rng.float();
      if (fictional && target && ((persona === "AGRESSIVA" && roll < 0.6) || (persona !== "TECNICA" && roll < 0.18) || (leader === target.id && roll < 0.35))) {
        // ataque: tira fôlego do alvo, rende um pouco a quem ataca, e o alvo decide como reagir
        target.campaign.momentum = Math.max(-1, target.campaign.momentum - 0.035);
        (target.campaign.journal ??= []).push({ on: ctx.date, cause: `ataque de ${person.name}`, delta: -0.035 });
        rc.campaign.momentum = Math.min(1, rc.campaign.momentum + 0.015);
        ctx.save("candidacies", target);
        ctx.save("candidacies", rc);
        const tst = ctx.pstate(target.person_id);
        if (tst) {
          const themes = ["sua falta de experiência", "as promessas que você fez", "seus financiadores", "sua ligação com o partido", "o que você fez (ou não fez) até aqui"];
          scheduleStory(tst, "ataque_adversario", ctx.date, { rival: person.id, rivalCand: rc.id, theme: rng.pick(themes) });
          ctx.save("person_states", tst);
        }
        continue;
      }
      const seg = (rc.campaign.seg ??= {});
      if (persona === "POPULISTA" && fictional) {
        const key = rng.pick(Object.keys(SEGMENT_BY_KEY));
        seg[key] = Math.min(1, (seg[key] ?? 0) + 0.08);
        for (const pc of players) (pc.campaign.journal ??= []).push({ on: ctx.date, cause: `promessas de ${person.name} a ${segLabel(key).toLowerCase()}`, delta: -0.01 });
      } else if (persona === "VETERANA") {
        for (const k of Object.keys(SEGMENT_BY_KEY)) seg[k] = Math.min(1, (seg[k] ?? 0) + 0.025);
        for (const pc of players) (pc.campaign.journal ??= []).push({ on: ctx.date, cause: `apoios declarados a ${person.name}`, delta: -0.012 });
      } else {
        rc.campaign.momentum = Math.min(1, rc.campaign.momentum + 0.025);
        for (const pc of players) (pc.campaign.journal ??= []).push({ on: ctx.date, cause: `propaganda de ${person.name} na TV e nas redes`, delta: -0.008 });
      }
      ctx.save("candidacies", rc);
      for (const pc of players) ctx.save("candidacies", pc);
    }
  }
}

export function ufElectorate(uf: string): number {
  return getUF(uf).electorate;
}
