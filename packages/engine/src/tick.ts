import { clockTarget } from "./clock";
import { monthlyFamily } from "./family";
import { partyInvitations, processAffiliationRequests } from "./affiliation";
import { addDays, day, diffDays, month, weekday } from "./calendar";
import { dailyCrime, monthlyCrime } from "./crime";
import { copomMeeting, isCopomDay, monthlyEconomy } from "./economy";
import {
  createRaces,
  dailyCampaign,
  processMandates,
  runConventions,
  runDebates,
  runFirstRound,
  runPolls,
  runRunoff,
  scheduleDebates,
  updateTerritoryFromResults,
} from "./elections";
import { dailyBillVotes, dailyPolicies, monthlyBills, monthlyFiscalStance } from "./government";
import { monthlyFinances, monthlyPartyFinances } from "./finance";
import { monthlyApproval } from "./approval";
import { energyRecovery } from "./wellbeing";
import { dailyPartyFormation, playerPartyRecruitment, processPartyInvites } from "./partyfounding";
import { partySwitchWindow, weeklyAgenda, yearlyRenewal } from "./npclife";
import { creditPartyFunds, returnUnusedFunds } from "./partycampaign";
import { checkAchievements } from "./achievements";
import { eraRules } from "./ruleset";
import { scheduledElection } from "./bootstrap";
import { afterPolls, rivalsDaily } from "./story/campaign";
import { dailyStory } from "./story/director";
import { afterConventions, afterVote, campaignKickoff, scheduleLiveDebates } from "./story/hooks";
import { Ctx, type WorldState } from "./state";
import type { ElectionRow } from "./types";

/** Calendário eleitoral do dia. */
function electionCalendarDay(ctx: Ctx, e: ElectionRow): void {
  const d = ctx.date;
  const cal = e.calendar;
  if (e.status === "AGENDADA" && d >= cal.preCampaignStart) {
    e.status = "PRE_CAMPANHA";
    ctx.save("elections", e);
    createRaces(ctx, e);
    const era = eraRules(e.year);
    ctx.publish("ELECTION_CALENDAR", {
      facts: {
        title: `Começa o ano eleitoral de ${e.year}`,
        body: `${e.kind === "GERAL" ? "Eleições gerais (Presidência, governos, Senado, Câmara e Assembleias)" : "Eleições municipais (prefeituras e câmaras)"} em ${e.first_round}. Prazo de filiação: ${cal.filiationDeadline}. ${era.notes.join(" ")}`,
      },
      importance: 3,
    });
    // garante a eleição seguinte agendada
    for (const y of [e.year + 2, e.year + 4]) {
      if (!ctx.t.elections.has(`e${y}`)) ctx.save("elections", scheduledElection(ctx.world.id, y));
    }
  }
  if (d === cal.filiationDeadline) {
    ctx.publish("ELECTION_CALENDAR", { facts: { title: `Termina hoje o prazo de filiação para ${e.year}`, body: "Quem quiser disputar a eleição precisa estar filiado(a) até hoje." } });
  }
  if (eraRules(e.year).partySwitchWindow ? d >= cal.partySwitchWindowStart && d <= cal.partySwitchWindowEnd : d.slice(5) === "09-15") {
    partySwitchWindow(ctx, e);
  }
  if (d === cal.conventionStart && e.status === "PRE_CAMPANHA") {
    e.status = "CONVENCOES";
    ctx.save("elections", e);
    ctx.publish("ELECTION_CALENDAR", { facts: { title: "Começa o período de convenções partidárias", body: `Até ${cal.conventionEnd}, os partidos definem candidaturas e coligações.` } });
  }
  if (d === cal.conventionEnd) {
    runConventions(ctx, e);
    creditPartyFunds(ctx, e);
    afterConventions(ctx, e);
  }
  if (d === cal.campaignStart && (e.status === "CONVENCOES" || e.status === "PRE_CAMPANHA")) {
    e.status = "CAMPANHA";
    ctx.save("elections", e);
    scheduleDebates(ctx, e, 1);
    campaignKickoff(ctx, e);
    ctx.publish("ELECTION_CALENDAR", { facts: { title: "Começa a campanha eleitoral oficial", body: `Propaganda nas ruas e na internet está liberada. Primeiro turno em ${e.first_round}.` }, importance: 2 });
  }
  if (e.status === "CAMPANHA" || e.status === "SEGUNDO_TURNO") {
    dailyCampaign(ctx, e);
    rivalsDaily(ctx, e.id);
    const target = e.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round;
    const left = diffDays(target, d);
    if (left > 0 && left <= 60 && weekday(d) === 5) afterPolls(ctx, runPolls(ctx, e, true));
    if (left > 0 && left <= 60 && weekday(d) === 2 && left % 14 < 7) afterPolls(ctx, runPolls(ctx, e, false));
  }
  if (e.status === "PRE_CAMPANHA" && day(d) === 15 && [3, 5, 6].includes(month(d))) runPolls(ctx, e, true);
  if (d === e.first_round && e.status === "CAMPANHA") {
    returnUnusedFunds(ctx, e);
    runFirstRound(ctx, e);
    updateTerritoryFromResults(ctx, e);
    afterVote(ctx, e, 1);
  }
  if (d === e.runoff && e.status === "SEGUNDO_TURNO") {
    runRunoff(ctx, e);
    afterVote(ctx, e, 2);
  }
}

/** Avança o mundo um dia. */
/**
 * Uma etapa do dia com nome: se quebrar, o erro diz qual etapa e em que data
 * (em produção o motor roda minificado e a pilha sozinha não diz onde foi).
 */
let current: Ctx | null = null;
function step(name: string, date: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    const err = new Error(`[${name} · ${date}] ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    // produção: a etapa fica para o dia seguinte e o erro vai para o registro; o mundo não trava
    if (current?.tolerant) current.faults.push({ step: name, date, error: err });
    else throw err;
  }
}

/**
 * Quem saiu da vida pública (morte, aposentadoria, condenação) não segue candidato nem
 * filiado. A pessoa nem fica na memória do mundo, então uma candidatura esquecida aberta
 * quebrava as pesquisas e a apuração e travava o dia. Roda antes de tudo: também cura
 * mundos em que isso ficou para trás.
 */
export function tidyRetired(ctx: Ctx): void {
  const gone = (id: string) => ctx.t.persons.get(id)?.status !== "ACTIVE";
  for (const c of ctx.t.candidacies.values()) {
    if (!(c.status === "PRE" || c.status === "HOMOLOGADA" || c.status === "SEGUNDO_TURNO") || !gone(c.person_id)) continue;
    c.status = "DESISTENTE";
    c.note = "Candidatura encerrada: deixou a vida pública.";
    ctx.save("candidacies", c);
  }
  for (const m of ctx.t.memberships.values()) {
    if (m.status !== "ATIVA" || !gone(m.person_id)) continue;
    m.status = "ENCERRADA";
    m.left_on = ctx.date;
    ctx.save("memberships", m);
  }
}

export function advanceDay(ctx: Ctx): void {
  current = ctx;
  const w = ctx.world;
  w.tick += 1;
  w.game_date = addDays(w.game_date, 1);
  ctx.beginTick();
  const d = w.game_date;
  step("coerência de candidaturas e filiações", d, () => tidyRetired(ctx));

  // Energia e renda dos jogadores
  step("energia dos jogadores", d, () => {
    for (const p of ctx.t.persons.values()) {
      if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
      const st = ctx.pstate(p.id);
      if (!st) continue;
      const before = st.energy;
      // muito cansaço, lesão ou falta de casa devolvem menos energia
      st.energy = Math.min(100, st.energy + energyRecovery(st, d));
      st.offers = st.offers.filter((o) => o.expires_tick > w.tick);
      if (st.jailed_until && st.jailed_until <= d) {
        st.jailed_until = null;
        ctx.notify(p.id, "Você deixou o regime fechado", "A pena progrediu de regime. Você volta a poder agir, mas a condenação continua na sua ficha.", "/jogo/investigacoes");
      }
      if (st.energy !== before) ctx.save("person_states", st);
    }
  });
  if (day(d) === 1) {
    step("finanças do mês", d, () => monthlyFinances(ctx));
    step("família do mês", d, () => monthlyFamily(ctx));
    step("aprovação do mês", d, () => monthlyApproval(ctx));
  }

  step("mandatos", d, () => processMandates(ctx));
  step("pedidos de filiação", d, () => processAffiliationRequests(ctx));
  step("convites de partido", d, () => processPartyInvites(ctx));
  step("partidos em formação", d, () => dailyPartyFormation(ctx));
  for (const e of [...ctx.t.elections.values()].sort((a, b) => a.year - b.year)) {
    if (e.status === "ENCERRADA") continue;
    step(`calendário da eleição ${e.year} (${e.status})`, d, () => electionCalendarDay(ctx, e));
  }
  step("debates", d, () => scheduleLiveDebates(ctx, runDebates(ctx)));
  step("crimes do dia", d, () => dailyCrime(ctx));
  step("políticas públicas", d, () => dailyPolicies(ctx));
  step("votações", d, () => dailyBillVotes(ctx));
  if (isCopomDay(d)) step("Copom", d, () => copomMeeting(ctx));

  if (weekday(d) === 1) {
    step("convites da semana", d, () => partyInvitations(ctx));
    step("recrutamento de jogadores", d, () => playerPartyRecruitment(ctx));
    step("agenda da semana", d, () => weeklyAgenda(ctx));
  }
  if (day(d) === 1) {
    step("economia do mês", d, () => monthlyEconomy(ctx));
    step("postura fiscal", d, () => monthlyFiscalStance(ctx));
    step("projetos do mês", d, () => monthlyBills(ctx));
    step("crimes do mês", d, () => monthlyCrime(ctx));
    step("finanças dos partidos", d, () => monthlyPartyFinances(ctx));
  }
  if (month(d) === 1 && day(d) === 2) step("renovação do ano", d, () => yearlyRenewal(ctx));
  // a vida de cada jogador: saúde, prazos, continuações e (para quem está vivendo os dias) o acaso
  step("vida dos jogadores", d, () => dailyStory(ctx));
  step("conquistas", d, () => {
    for (const p of ctx.t.persons.values()) if (p.kind === "PLAYER" && p.status === "ACTIVE") checkAchievements(ctx, p);
  });
  ctx.saveWorld();
}

/** Tick alvo segundo o relógio real do mundo (saltos fixos nos compartilhados; parado nos do jogador). */
export function targetTick(state: WorldState, nowIso: string): number {
  return clockTarget(state.world, Date.parse(nowIso));
}

/** Avança até `maxTicks` dias (ou até o alvo) e devolve as mudanças acumuladas. */
export function runTicks(state: WorldState, opts: { target: number; maxTicks: number; budgetMs?: number; now?: () => number; tolerant?: boolean }): { ctx: Ctx; ticks: number } {
  const ctx = new Ctx(state, "tick");
  ctx.tolerant = !!opts.tolerant;
  const now = opts.now ?? (() => 0);
  const start = now();
  let ticks = 0;
  while (state.world.tick < opts.target && ticks < opts.maxTicks) {
    advanceDay(ctx);
    ticks++;
    if (opts.budgetMs && now() - start > opts.budgetMs) break;
  }
  return { ctx, ticks };
}
