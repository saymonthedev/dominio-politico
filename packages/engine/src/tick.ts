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
import { profession } from "./names";
import { partySwitchWindow, weeklyAgenda, yearlyRenewal } from "./npclife";
import { eraRules } from "./ruleset";
import { scheduledElection } from "./bootstrap";
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
  }
  if (d === cal.campaignStart && (e.status === "CONVENCOES" || e.status === "PRE_CAMPANHA")) {
    e.status = "CAMPANHA";
    ctx.save("elections", e);
    scheduleDebates(ctx, e, 1);
    ctx.publish("ELECTION_CALENDAR", { facts: { title: "Começa a campanha eleitoral oficial", body: `Propaganda nas ruas e na internet está liberada. Primeiro turno em ${e.first_round}.` }, importance: 2 });
  }
  if (e.status === "CAMPANHA" || e.status === "SEGUNDO_TURNO") {
    dailyCampaign(ctx, e);
    const target = e.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round;
    const left = diffDays(target, d);
    if (left > 0 && left <= 60 && weekday(d) === 5) runPolls(ctx, e, true);
    if (left > 0 && left <= 60 && weekday(d) === 2 && left % 14 < 7) runPolls(ctx, e, false);
  }
  if (e.status === "PRE_CAMPANHA" && day(d) === 15 && [3, 5, 6].includes(month(d))) runPolls(ctx, e, true);
  if (d === e.first_round && e.status === "CAMPANHA") {
    runFirstRound(ctx, e);
    updateTerritoryFromResults(ctx, e);
  }
  if (d === e.runoff && e.status === "SEGUNDO_TURNO") {
    runRunoff(ctx, e);
  }
}

/** Avança o mundo um dia. */
export function advanceDay(ctx: Ctx): void {
  const w = ctx.world;
  w.tick += 1;
  w.game_date = addDays(w.game_date, 1);
  ctx.beginTick();
  const d = w.game_date;

  // Energia e renda dos jogadores
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    const before = st.energy;
    st.energy = Math.min(100, st.energy + 25);
    st.offers = st.offers.filter((o) => o.expires_tick > w.tick);
    if (day(d) === 1) {
      const salary = p.office_code ? 25_000 : 0;
      const income = Math.round(profession(p.profession).income * 0.25) + salary;
      st.money += income;
      if (month(d) === 1) st.income_last_year = 0;
      st.income_last_year += income;
      st.political_capital = Math.min(100, st.political_capital + (p.office_code ? 3 : 0.5));
    }
    if (st.energy !== before || day(d) === 1) ctx.save("person_states", st);
  }

  processMandates(ctx);
  processAffiliationRequests(ctx);
  for (const e of [...ctx.t.elections.values()].sort((a, b) => a.year - b.year)) {
    if (e.status === "ENCERRADA") continue;
    electionCalendarDay(ctx, e);
  }
  runDebates(ctx);
  dailyCrime(ctx);
  dailyPolicies(ctx);
  dailyBillVotes(ctx);
  if (isCopomDay(d)) copomMeeting(ctx);

  if (weekday(d) === 1) {
    partyInvitations(ctx);
    weeklyAgenda(ctx);
  }
  if (day(d) === 1) {
    monthlyEconomy(ctx);
    monthlyFiscalStance(ctx);
    monthlyBills(ctx);
    monthlyCrime(ctx);
  }
  if (month(d) === 1 && day(d) === 2) yearlyRenewal(ctx);
  ctx.saveWorld();
}

/** Tick alvo segundo o relógio real do mundo. */
export function targetTick(state: WorldState, nowIso: string): number {
  const w = state.world;
  const hours = (Date.parse(nowIso) - Date.parse(w.anchor_real_at)) / 3_600_000;
  return w.anchor_tick + Math.max(0, Math.floor(hours * w.game_days_per_real_hour));
}

/** Avança até `maxTicks` dias (ou até o alvo) e devolve as mudanças acumuladas. */
export function runTicks(state: WorldState, opts: { target: number; maxTicks: number; budgetMs?: number; now?: () => number }): { ctx: Ctx; ticks: number } {
  const ctx = new Ctx(state, "tick");
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
