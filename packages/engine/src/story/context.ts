import { ageAt, diffDays, type ISODate } from "../calendar";
import { worldPriceLevel } from "../finance";
import { ideologyAffinity } from "../ideology";
import { profession } from "../names";
import { OFFICES } from "../ruleset";
import type { Rng } from "../rng";
import type { Ctx } from "../state";
import type { CandidacyRow, ElectionRow, PartyRow, PersonRow, PersonStateRow, RaceRow } from "../types";
import { storyOf } from "./state";
import type { StoryState } from "./types";

export type CampaignPhase = "PRE" | "CONVENCAO" | "CAMPANHA" | "RETA_FINAL" | "SEGUNDO_TURNO";

/** Tudo o que um evento precisa saber do personagem e do mundo. */
export class StoryCtx {
  readonly s: StoryState;
  private _cand: CandidacyRow | null | undefined;
  private _election: ElectionRow | null | undefined;

  constructor(
    readonly ctx: Ctx,
    readonly p: PersonRow,
    readonly st: PersonStateRow,
    readonly rng: Rng,
  ) {
    this.s = storyOf(st, p, ctx.date);
  }

  get date(): ISODate {
    return this.ctx.date;
  }

  get age(): number {
    return ageAt(this.p.birth_year, this.ctx.date);
  }

  get party(): PartyRow | undefined {
    return this.p.party_id ? this.ctx.t.parties.get(this.p.party_id) : undefined;
  }

  get professionId(): string {
    return this.p.profession.split("|")[0];
  }

  get professionLabel(): string {
    return profession(this.professionId).label;
  }

  /** renda mensal da profissão (sem cargo), no nível de preços do dia */
  get salary(): number {
    return Math.round(profession(this.professionId).income * worldPriceLevel(this.ctx.world));
  }

  /** valor de referência (R$ de 2026) no nível de preços do dia */
  money(base: number): number {
    const v = base * worldPriceLevel(this.ctx.world);
    return v >= 10_000 ? Math.round(v / 1000) * 1000 : Math.round(v / 100) * 100;
  }

  /** fração do salário que está entrando (licença, meio período, demissão) */
  get jornada(): number {
    const v = this.s.flags.jornada;
    return typeof v === "number" ? v : 1;
  }

  /** chance com piso e teto (nada é garantido, nada é impossível) */
  roll(p: number): boolean {
    return this.rng.chance(Math.max(0.04, Math.min(0.96, p)));
  }

  get charisma(): number {
    return this.st.traits.charisma;
  }

  get competence(): number {
    return this.st.traits.competence;
  }

  get office(): string | null {
    return this.p.office_code ? OFFICES[this.p.office_code].name : null;
  }

  /** candidatura viva (pré, homologada ou em 2º turno) */
  get cand(): CandidacyRow | null {
    if (this._cand === undefined) this._cand = liveCandidacy(this.ctx, this.p.id) ?? null;
    return this._cand;
  }

  get race(): RaceRow | undefined {
    return this.cand ? this.ctx.t.races.get(this.cand.race_id) : undefined;
  }

  /** eleição em curso (da pré-campanha ao 2º turno) */
  get election(): ElectionRow | null {
    if (this._election === undefined) {
      this._election =
        [...this.ctx.t.elections.values()].filter((e) => e.status !== "AGENDADA" && e.status !== "ENCERRADA").sort((a, b) => a.year - b.year)[0] ?? null;
    }
    return this._election;
  }

  /** fase da campanha do personagem (null = não está disputando nada agora) */
  get phase(): CampaignPhase | null {
    const c = this.cand;
    const e = c ? this.ctx.t.elections.get(c.election_id) : undefined;
    if (!c || !e) return null;
    if (c.status === "PRE") return this.date >= e.calendar.conventionStart ? "CONVENCAO" : "PRE";
    if (c.status === "SEGUNDO_TURNO") return "SEGUNDO_TURNO";
    if (c.status !== "HOMOLOGADA" || e.status === "SEGUNDO_TURNO") return null;
    if (this.date < e.calendar.campaignStart) return "CONVENCAO";
    return diffDays(e.first_round, this.date) <= 14 ? "RETA_FINAL" : "CAMPANHA";
  }

  /** dias até o próximo turno da candidatura */
  get daysToVote(): number | null {
    const c = this.cand;
    const e = c ? this.ctx.t.elections.get(c.election_id) : undefined;
    if (!c || !e) return null;
    return diffDays(c.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round, this.date);
  }

  get proportional(): boolean {
    return !!this.cand && OFFICES[this.cand.office_code].system === "PROPORCIONAL";
  }

  get unemployment(): number {
    return this.ctx.s.economy.unemployment;
  }

  get inflation(): number {
    return this.ctx.s.economy.inflation_12m;
  }

  get approval(): number {
    return this.ctx.world.gov.approval;
  }

  get openCases(): number {
    return [...this.ctx.t.investigations.values()].filter((i) => i.person_id === this.p.id && !i.outcome).length;
  }

  /** afinidade (0..1) do personagem com um partido */
  affinity(party: PartyRow): number {
    return ideologyAffinity(this.p.ideology, party.ideology);
  }

  /** dias desde a última vez que um evento aconteceu (Infinity se nunca) */
  since(def: string): number {
    const last = this.s.seen[def]?.last;
    return last ? diffDays(this.date, last) : Infinity;
  }

  flag(key: string): string | number | boolean | undefined {
    return this.s.flags[key];
  }

  num(key: string): number {
    const v = this.s.flags[key];
    return typeof v === "number" ? v : v ? 1 : 0;
  }
}

export function liveCandidacy(ctx: Ctx, personId: string): CandidacyRow | undefined {
  return [...ctx.t.candidacies.values()].find(
    (c) => c.person_id === personId && ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"].includes(c.status) && ctx.t.elections.get(c.election_id)?.status !== "ENCERRADA",
  );
}
