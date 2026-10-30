import { addDays } from "../calendar";
import type { Ctx } from "../state";
import type { DebateRow, ElectionRow } from "../types";
import { communityLeader, home } from "./catalog/util";
import { StoryCtx } from "./context";
import { scheduleStory, storyOf } from "./state";
import { canAct, partyLeader } from "./world";

/**
 * Pontes entre o calendário do motor e os acontecimentos da carreira: quando
 * a convenção decide, a campanha começa, o debate entra no ar ou as urnas
 * falam, o jogador recebe o momento como acontecimento (com escolha).
 */

function playerCands(ctx: Ctx, e: ElectionRow) {
  return [...ctx.t.candidacies.values()].filter((c) => c.election_id === e.id && c.is_player && ctx.person(c.person_id)?.status === "ACTIVE");
}

function schedule(ctx: Ctx, personId: string, def: string, due: string, data: Record<string, string | number>): void {
  const st = ctx.pstate(personId);
  if (!st) return;
  scheduleStory(st, def, due, data);
  ctx.save("person_states", st);
}

/** Fim das convenções: cada pré-candidatura de jogador vira resultado (homologada, barrada ou preterida). */
export function afterConventions(ctx: Ctx, e: ElectionRow): void {
  for (const c of playerCands(ctx, e)) {
    if (!["HOMOLOGADA", "INDEFERIDA", "DESISTENTE"].includes(c.status)) continue;
    schedule(ctx, c.person_id, "convencao_resultado", ctx.date, { cand: c.id });
  }
}

/** Início da campanha oficial: primeira reunião de estratégia de quem está na urna. */
export function campaignKickoff(ctx: Ctx, e: ElectionRow): void {
  for (const c of playerCands(ctx, e)) {
    if (c.status !== "HOMOLOGADA") continue;
    schedule(ctx, c.person_id, "reuniao_estrategia", ctx.date, { cand: c.id });
  }
}

/** Debates ao vivo com jogadores no palco. */
export function scheduleLiveDebates(ctx: Ctx, debates: DebateRow[]): void {
  for (const d of debates) {
    for (const cid of d.participants) {
      const c = ctx.t.candidacies.get(cid);
      if (!c?.is_player) continue;
      schedule(ctx, c.person_id, "debate_ao_vivo", ctx.date, { debate: d.id, cand: c.id });
    }
  }
}

/** Depois de cada turno: resultado como acontecimento; no 2º turno, a corrida por apoios; depois, a prestação de contas. */
export function afterVote(ctx: Ctx, e: ElectionRow, round: 1 | 2): void {
  for (const c of [...ctx.t.candidacies.values()].filter((x) => x.election_id === e.id && x.is_player)) {
    const p = ctx.person(c.person_id);
    const st = ctx.pstate(c.person_id);
    if (!p || !st || p.status !== "ACTIVE") continue;
    const runoff = ctx.t.races.get(c.race_id)?.results.runoff;
    const decided =
      round === 1 ? ["ELEITO", "NAO_ELEITO", "SUPLENTE", "SEGUNDO_TURNO"].includes(c.status) : ["ELEITO", "NAO_ELEITO"].includes(c.status) && !!runoff?.candidates.some((x) => x.candidacy_id === c.id);
    if (!decided) continue;
    scheduleStory(st, "resultado_eleicao", ctx.date, { cand: c.id, round });
    if (c.status === "SEGUNDO_TURNO") {
      scheduleStory(st, "segundo_turno_apoios", addDays(ctx.date, 2), { cand: c.id });
      // o 2º turno é outra eleição: as pesquisas recomeçam do zero
      c.campaign.last_poll = null;
      c.campaign.journal = [];
      ctx.save("candidacies", c);
    }
    if (c.status !== "SEGUNDO_TURNO") {
      const costs = Object.values(c.campaign.costs ?? {}).reduce((a, v) => a + v, 0);
      scheduleStory(st, "prestacao_contas", addDays(ctx.date, ctx.rng("contas", c.id).int(18, 30)), {
        cand: c.id,
        spent: Math.round(c.campaign.spent),
        costs: Math.round(costs),
        since: e.calendar.preCampaignStart,
      });
      // a licença do trabalho para a campanha termina com a eleição
      const s = storyOf(st);
      if (s.flags.jornada === 0 && s.flags.licenca_campanha) {
        delete s.flags.jornada;
        delete s.flags.licenca_campanha;
      }
    }
    ctx.save("person_states", st);
  }
}

/**
 * Ações manuais também puxam histórias: quem ajuda no evento do bairro pode
 * receber, dias depois, a ligação de uma liderança; quem vai à reunião de um
 * partido (ou conversa com alguém dele) pode chamar a atenção da direção.
 */
export function afterAction(ctx: Ctx, personId: string, actionId: string, params: Record<string, string>): void {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  if (!p || !st || p.kind !== "PLAYER") return;
  const s = storyOf(st, p, ctx.date);
  if (s.ended) return;
  const rng = ctx.rng("after-action", `${personId}:${actionId}:${st.action_seq}`);
  const soon = (min: number, max: number) => addDays(ctx.date, rng.int(min, max));
  if (actionId === "evento_local" && !s.flags.lider_comunitario && !s.queue.some((q) => q.def === "lideranca_local_contato") && rng.chance(0.25)) {
    const c = new StoryCtx(ctx, p, st, rng);
    const hood = home(c);
    const leader = communityLeader(c, hood);
    s.flags.lider_comunitario = leader.id;
    scheduleStory(st, "lideranca_local_contato", soon(4, 10), { leader: leader.id, hood });
  }
  if (!p.party_id && (actionId === "reuniao_partidaria" || actionId === "conversar")) {
    const target = actionId === "conversar" ? ctx.person(params.target) : undefined;
    const party = ctx.t.parties.get(actionId === "reuniao_partidaria" ? params.party : target?.party_id ?? "");
    const chance = actionId === "reuniao_partidaria" ? 0.3 : 0.15;
    if (party && party.status === "ATIVO" && !s.flags[`cafe:${party.id}`] && !s.queue.some((q) => q.def === "dirigente_interessado") && rng.chance(chance)) {
      const leader = target && canAct(target) ? target : partyLeader(ctx, p, party);
      scheduleStory(st, "dirigente_interessado", soon(7, 20), { party: party.id, leader: leader.id, warm: 0 });
    }
  }
  ctx.save("person_states", st);
}
