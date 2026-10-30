import { relKey } from "../affiliation";
import { addDays } from "../calendar";
import { createIllicitAct, type ActOptions } from "../crime";
import { ufOfGeo } from "../elections";
import type { IllicitKind } from "../crimes";
import { UF_BY_CODE } from "../geo";
import { SEGMENT_BY_KEY } from "../segments";
import type { CareerStage, FinanceKind, IllicitActRow } from "../types";
import type { StoryCtx } from "./context";
import { scheduleStory } from "./state";
import type { StoryDelta } from "./types";

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/**
 * Reputação sobe cada vez mais devagar: no começo, cada gesto conta; perto do
 * topo, só grandes feitos movem o ponteiro. Quedas valem por inteiro.
 */
export function reputationGain(before: number, delta: number): number {
  if (delta <= 0) return delta;
  return delta * Math.max(0.15, Math.min(1, 1.2 - before / 75));
}

/**
 * Ficar conhecido num estado grande é mais difícil: o reconhecimento conquistado
 * fora de campanha (que mede o estado inteiro) cresce mais devagar onde há mais eleitores.
 */
export function reachScale(uf: string): number {
  const electorate = UF_BY_CODE[uf]?.electorate ?? 3_000_000;
  return Math.max(0.25, Math.min(1.5, Math.sqrt(2_000_000 / electorate)));
}

/** Prestígio no partido: fácil de ganhar no começo, difícil perto da cúpula. */
export function standingGain(before: number, delta: number): number {
  if (delta <= 0) return delta;
  return delta * Math.max(0.2, Math.min(1, 1.15 - before / 85));
}
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Aplica as consequências de uma escolha e anota cada variação para a tela
 * (os números que sobem do pop-up). Grava as linhas tocadas no fim.
 */
export class Effects {
  private readonly d = new Map<string, StoryDelta>();
  private personTouched = false;
  private candTouched = false;

  constructor(readonly c: StoryCtx) {}

  private add(key: string, label: string, v: number, opt: { money?: boolean; bad?: boolean } = {}): void {
    if (!v) return;
    const cur = this.d.get(key);
    const value = (cur?.value ?? 0) + v;
    this.d.set(key, { key, label, value: opt.money ? Math.round(value) : round1(value), money: opt.money, bad: opt.bad });
  }

  deltas(): StoryDelta[] {
    return [...this.d.values()].filter((x) => Math.abs(x.value) >= (x.money ? 1 : 0.1));
  }

  // ------------------------------------------------------------- personagem
  money(v: number, description: string, kind?: FinanceKind): void {
    const { ctx, p, st } = this.c;
    if (!v) return;
    st.money += v;
    this.add("caixa", "caixa", v, { money: true });
    ctx.insert("finance_transactions", {
      id: ctx.id("fin", p.id, "story"),
      world_id: ctx.world.id,
      person_id: p.id,
      candidacy_id: null,
      kind: kind ?? (v >= 0 ? "RENDA" : "DESPESA"),
      amount: Math.round(v),
      declared: true,
      game_date: ctx.date,
      description,
    });
  }

  energy(v: number): void {
    const st = this.c.st;
    const before = st.energy;
    st.energy = clamp(st.energy + v);
    this.add("energia", "energia", st.energy - before);
  }

  reputation(v: number): void {
    const p = this.c.p;
    const before = p.reputation;
    p.reputation = round1(clamp(p.reputation + reputationGain(before, v)));
    this.personTouched = true;
    this.add("reputacao", "reputação", p.reputation - before);
  }

  visibility(v: number): void {
    const p = this.c.p;
    p.visibility = round1(clamp(p.visibility + v));
    this.personTouched = true;
    this.add("visibilidade", "visibilidade", v);
  }

  /** reconhecimento do nome na UF (pontos percentuais); em campanha, na UF da disputa */
  reach(v: number, uf = this.c.cand && this.c.cand.geo !== "BR" ? ufOfGeo(this.c.cand.geo) : this.c.p.uf): void {
    const st = this.c.st;
    const before = st.reach[uf] ?? 0;
    const scaled = v > 0 && !this.c.cand ? v * reachScale(uf) : v;
    st.reach[uf] = clamp(before + scaled * (v > 0 ? 1 - before * 0.6 : 1), 0, 0.98);
    this.add("reconhecimento", "reconhecimento", (st.reach[uf] - before) * 100);
  }

  activism(v: number): void {
    const st = this.c.st;
    const before = st.activism;
    st.activism = clamp(st.activism + v);
    this.add("ativismo", "ativismo", st.activism - before);
  }

  capital(v: number): void {
    const st = this.c.st;
    const before = st.political_capital;
    st.political_capital = clamp(st.political_capital + v);
    this.add("capital", "capital político", st.political_capital - before);
  }

  standing(v: number): void {
    const { p, st } = this.c;
    if (!p.party_id) return;
    const before = st.party_standing;
    st.party_standing = clamp(st.party_standing + standingGain(before, v));
    this.add("prestigio", "prestígio no partido", st.party_standing - before);
  }

  debate(v: number): void {
    const st = this.c.st;
    const before = st.debate_prep;
    st.debate_prep = clamp(st.debate_prep + v);
    this.add("debate", "preparo p/ debate", st.debate_prep - before);
  }

  scandal(v: number): void {
    const st = this.c.st;
    const before = st.scandal;
    st.scandal = clamp(st.scandal + v);
    this.add("escandalo", "risco de escândalo", st.scandal - before, { bad: true });
  }

  health(v: number): void {
    const s = this.c.s;
    const before = s.health;
    s.health = clamp(s.health + v);
    this.add("saude", "saúde", s.health - before);
  }

  dirty(v: number): void {
    const st = this.c.st;
    st.dirty_money = Math.max(0, st.dirty_money + v);
    this.add("sujo", "dinheiro não declarado", v, { money: true, bad: true });
  }

  debt(v: number): void {
    const st = this.c.st;
    const before = st.debt;
    st.debt = Math.max(0, Math.round(st.debt + v));
    this.add("divida", "dívida", st.debt - before, { money: true, bad: true });
  }

  /** relação com alguém (-100..100) */
  rel(personId: string, v: number): number {
    const { ctx, p } = this.c;
    const other = ctx.person(personId);
    if (!other || !v) return ctx.t.relationships.get(relKey(p.id, personId))?.score ?? 0;
    const id = relKey(p.id, personId);
    const row = ctx.t.relationships.get(id) ?? { id, world_id: ctx.world.id, a_id: p.id, b_id: personId, score: 0, interactions: 0, last_on: ctx.date };
    const before = row.score;
    row.score = clamp(row.score + v, -100, 100);
    row.interactions += 1;
    row.last_on = ctx.date;
    ctx.save("relationships", row);
    this.add(`rel:${personId}`, `relação com ${other.name.split(" ")[0]}`, row.score - before);
    return row.score;
  }

  stage(stage: CareerStage): void {
    this.c.p.stage = stage;
    this.personTouched = true;
  }

  /** marca o personagem para gravar (mudanças diretas: ideologia, ala) */
  touch(): void {
    this.personTouched = true;
  }

  // ------------------------------------------------------------- memória e continuações
  flag(key: string, value: string | number | boolean = true): void {
    this.c.s.flags[key] = value;
  }

  unflag(key: string): void {
    delete this.c.s.flags[key];
  }

  bump(key: string, by = 1): number {
    const v = (typeof this.c.s.flags[key] === "number" ? (this.c.s.flags[key] as number) : 0) + by;
    this.c.s.flags[key] = v;
    return v;
  }

  /** continuação daqui a alguns dias (número fixo ou faixa sorteada) */
  schedule(def: string, days: number | [number, number], data: Record<string, string | number> = {}): void {
    const n = Array.isArray(days) ? this.c.rng.int(days[0], days[1]) : days;
    scheduleStory(this.c.st, def, addDays(this.c.date, Math.max(0, n)), data);
  }

  /** notícia privada no feed da carreira */
  news(title: string, body: string): void {
    this.c.ctx.careerNews(this.c.p.id, title, body);
  }

  notify(title: string, body: string, link: string | null = null): void {
    this.c.ctx.notify(this.c.p.id, title, body, link);
  }

  illicit(kind: IllicitKind, opts: ActOptions): IllicitActRow {
    return createIllicitAct(this.c.ctx, this.c.p, kind, opts);
  }

  // ------------------------------------------------------------- campanha
  private cand() {
    const c = this.c.cand;
    if (c) this.candTouched = true;
    return c;
  }

  /** o que moveu a campanha (explica a próxima pesquisa) */
  journal(cause: string, delta: number): void {
    const c = this.cand();
    if (!c) return;
    const j = (c.campaign.journal ??= []);
    j.push({ on: this.c.date, cause, delta: Math.round(delta * 1000) / 1000 });
    if (j.length > 24) j.splice(0, j.length - 24);
  }

  momentum(v: number, cause?: string): void {
    const c = this.cand();
    if (!c || !v) return;
    c.campaign.momentum = Math.max(-1, Math.min(1, c.campaign.momentum + v));
    this.add("momentum", "fôlego da campanha", v * 100);
    if (cause) this.journal(cause, v);
  }

  /** apoio em segmentos de eleitores (-1..1); "focus" = os priorizados pela estratégia */
  seg(segments: string[] | "focus" | "all", v: number, cause?: string): void {
    const c = this.cand();
    if (!c || !v) return;
    const keys = segments === "all" ? Object.keys(SEGMENT_BY_KEY) : segments === "focus" ? c.campaign.focus?.length ? c.campaign.focus : Object.keys(SEGMENT_BY_KEY) : segments;
    const seg = (c.campaign.seg ??= {});
    for (const k of keys) seg[k] = Math.max(-1, Math.min(1, Math.round(((seg[k] ?? 0) + v) * 1000) / 1000));
    const label = keys.length === 1 ? `apoio: ${SEGMENT_BY_KEY[keys[0]]?.label.toLowerCase() ?? keys[0]}` : keys.length >= Object.keys(SEGMENT_BY_KEY).length ? "apoio geral" : "apoio nos grupos-alvo";
    this.add(`seg:${keys.join(",")}`, label, v * 100);
    if (cause) this.journal(cause, v * Math.min(1, keys.length / 3));
  }

  volunteers(n: number): void {
    const c = this.cand();
    if (!c || !n) return;
    c.campaign.volunteers = Math.max(0, c.campaign.volunteers + Math.round(n));
    this.add("voluntarios", "voluntários", Math.round(n));
  }

  rumor(v: number): void {
    const c = this.cand();
    if (!c || !v) return;
    c.campaign.rumor_damage = Math.max(0, c.campaign.rumor_damage + v);
    this.add("boatos", "desgaste com boatos", v, { bad: true });
  }

  /** doação declarada para a campanha */
  donation(v: number, description: string): void {
    const { ctx, p } = this.c;
    const c = this.cand();
    if (!c || v <= 0) return;
    c.campaign.budget += v;
    c.campaign.donations += v;
    this.add("orcamento", "orçamento da campanha", v, { money: true });
    ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "story-doacao"), world_id: ctx.world.id, person_id: p.id, candidacy_id: c.id, kind: "DOACAO", amount: Math.round(v), declared: true, game_date: ctx.date, description });
  }

  /** gasto de campanha: sai do orçamento e, se faltar, do bolso */
  campaignSpend(v: number, description: string, category: string): void {
    const { ctx, p, st } = this.c;
    const c = this.cand();
    if (v <= 0) return;
    if (c) {
      const fromBudget = Math.min(v, Math.max(0, c.campaign.budget - c.campaign.spent));
      c.campaign.spent += fromBudget;
      const costs = (c.campaign.costs ??= {});
      costs[category] = (costs[category] ?? 0) + v;
      if (fromBudget) this.add("orcamento", "orçamento da campanha", -fromBudget, { money: true });
      const rest = v - fromBudget;
      if (rest > 0) {
        st.money -= rest;
        this.add("caixa", "caixa", -rest, { money: true });
      }
    } else {
      st.money -= v;
      this.add("caixa", "caixa", -v, { money: true });
    }
    ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, "story-gasto"), world_id: ctx.world.id, person_id: p.id, candidacy_id: c?.id ?? null, kind: "DESPESA", amount: -Math.round(v), declared: true, game_date: ctx.date, description });
  }

  promise(title: string, segment: string): void {
    const c = this.cand();
    if (!c) return;
    const list = (c.campaign.promises ??= []);
    if (list.some((x) => x.title === title)) return;
    const id = `${c.id}:${list.length + 1}`;
    list.push({ id, title, segment, on: this.c.date });
    // a história guarda a promessa: a candidatura some da memória quando a eleição fecha
    (this.c.s.promises ??= []).push({ id, title, segment, on: this.c.date, election: c.election_id });
    this.c.s.flags[`promessa:${segment}`] = title;
  }

  /** grava tudo o que foi tocado */
  commit(): void {
    const { ctx, p, st } = this.c;
    if (this.personTouched) ctx.save("persons", p);
    ctx.save("person_states", st);
    const c = this.c.cand;
    if (c && this.candTouched) ctx.save("candidacies", c);
  }
}
