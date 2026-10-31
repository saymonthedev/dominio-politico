import type { ISODate } from "./calendar";
import { OFFICES } from "./ruleset";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Aprovação popular de quem tem mandato (0–100). Começa perto da metade na posse
 * (com o embalo da vitória), sobe e desce com o que o mandato entrega — propostas
 * aprovadas, emendas, obras, votos alinhados ao eleitorado — e com o que desgasta:
 * escândalo, ausência, voto contra a base, ostentação. Todo mês ela volta um pouco
 * para o "chão" da reputação e, no Executivo, para o humor com a economia.
 * Na reeleição, pesa direto no voto.
 */

const clamp = (v: number, lo = 3, hi = 97) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const LOG = 24;

const EXECUTIVE = new Set(["PREFEITO", "GOVERNADOR", "PRESIDENTE"]);

export function approvalOf(p: PersonRow, st: PersonStateRow | undefined): number | null {
  if (!p.office_code || !st?.story) return null;
  return st.story.approval ?? null;
}

/** Na posse (ou para quem já tinha mandato antes deste sistema): ponto de partida. */
export function ensureApproval(p: PersonRow, st: PersonStateRow, date: ISODate): void {
  const s = storyOf(st, p, date);
  if (!p.office_code) {
    if (s.approval != null) s.approval = null;
    return;
  }
  if (s.approval != null) return;
  const start = clamp(52 + (p.reputation - 50) * 0.3 - st.scandal * 0.15);
  s.approval = r1(start);
  s.approval_log = [{ on: date, delta: 0, cause: `Início do mandato de ${OFFICES[p.office_code].name.toLowerCase()}` }, ...(s.approval_log ?? [])].slice(0, LOG);
}

/** Mexe na aprovação e anota o motivo (a tela mostra o porquê). */
export function bumpApproval(p: PersonRow, st: PersonStateRow, date: ISODate, delta: number, cause: string): number {
  if (!p.office_code || !delta) return 0;
  ensureApproval(p, st, date);
  const s = st.story!;
  const before = s.approval ?? 50;
  s.approval = r1(clamp(before + delta));
  const real = r1(s.approval - before);
  if (real) s.approval_log = [{ on: date, delta: real, cause }, ...(s.approval_log ?? [])].slice(0, LOG);
  return real;
}

/** Fechamento do mês: a aprovação volta um pouco para o chão da reputação, da economia e dos escândalos. */
export function monthlyApproval(ctx: Ctx): void {
  const econ = ctx.s.economy;
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE" || !p.office_code) continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    ensureApproval(p, st, ctx.date);
    const s = st.story!;
    let base = 50 + (p.reputation - 50) * 0.35 - st.scandal * 0.25;
    if (EXECUTIVE.has(p.office_code)) {
      // quem governa responde pelo bolso: inflação e desemprego entram na conta
      const mood = (econ?.gdp_growth ?? 2) * 1.5 - ((econ?.inflation_12m ?? 4.5) - 4) * 1.5 - ((econ?.unemployment ?? 8) - 8) * 1.2;
      base += mood;
      if (p.office_code === "PRESIDENTE") base = base * 0.4 + ctx.world.gov.approval * 0.6;
      base -= 1.5; // o desgaste de governar
    }
    const before = s.approval ?? 50;
    const drift = (base - before) * 0.12;
    if (Math.abs(drift) >= 0.3) bumpApproval(p, st, ctx.date, drift, drift > 0 ? "Balanço do mês: a imagem do mandato melhorou" : "Balanço do mês: desgaste natural do cargo");
    ctx.save("person_states", st);
  }
}

/** Texto curto para a tela. */
export function approvalLabel(v: number): string {
  if (v >= 70) return "muito bem avaliado(a)";
  if (v >= 55) return "bem avaliado(a)";
  if (v >= 42) return "avaliação dividida";
  if (v >= 28) return "mal avaliado(a)";
  return "rejeitado(a)";
}
