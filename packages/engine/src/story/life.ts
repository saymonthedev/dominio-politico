import { ACHIEVEMENT_BY_ID, careerScore } from "../achievements";
import { ageAt, day, diffDays, formatDatePt, year } from "../calendar";
import { CRIMES } from "../crimes";
import { geoName } from "../elections";
import { profession } from "../names";
import { OFFICES, type OfficeCode } from "../ruleset";
import type { Ctx } from "../state";
import type { PersonRow } from "../types";
import type { StoryCtx } from "./context";
import { initialHealth, pushLog, storyOf } from "./state";
import type { CareerEnd, StoryLogEntry } from "./types";
import { cityLabel } from "./world";

/**
 * Vida do personagem: saúde que oscila com a idade e o desgaste da política,
 * e a morte — rara na juventude, mais provável com a idade e a saúde frágil.
 * Quando a carreira acaba, o resumo vira o pop-up final.
 */

/** Probabilidade anual de morte (curva de Gompertz aproximada à tábua brasileira). */
export function annualMortality(age: number): number {
  return Math.min(0.45, 0.00045 * Math.exp(0.085 * (age - 30)));
}

function healthFactor(health: number): number {
  if (health >= 75) return 0.6;
  if (health >= 55) return 1;
  if (health >= 35) return 2.2;
  return 4.5;
}

export function dailyLife(c: StoryCtx): void {
  const s = c.s;
  const age = c.age;
  if (day(c.date) === 1) {
    // a saúde volta devagar ao "teto" da idade; política desgasta
    const cap = initialHealth(age);
    let stress = 0;
    if (c.phase === "CAMPANHA" || c.phase === "RETA_FINAL" || c.phase === "SEGUNDO_TURNO") stress += 0.7;
    if (c.p.office_code) stress += 0.25;
    if (c.openCases) stress += 0.35;
    if (c.st.jailed_until && c.st.jailed_until > c.date) stress += 1.2;
    if (c.st.debt > c.st.money * 3 && c.st.debt > 50_000) stress += 0.3;
    s.health = Math.round(Math.max(1, Math.min(100, s.health + (cap - s.health) * 0.05 - stress)) * 10) / 10;
    // a memória do público é curta: fama e boa imagem precisam de manutenção
    const p = c.p;
    const campaigning = c.phase === "CAMPANHA" || c.phase === "RETA_FINAL" || c.phase === "SEGUNDO_TURNO";
    if (p.reputation > 55) p.reputation = Math.round((p.reputation - (p.reputation - 55) * 0.03) * 10) / 10;
    if (p.visibility > 5) p.visibility = Math.round((p.visibility - (p.visibility - 5) * 0.04) * 10) / 10;
    if (!campaigning && !p.office_code) for (const uf of Object.keys(c.st.reach)) c.st.reach[uf] = Math.round(c.st.reach[uf] * 0.985 * 10_000) / 10_000;
    c.ctx.save("persons", p);
  }
  // sem expediente (licença, meio período, demissão), sobra tempo e fôlego
  const jornada = typeof s.flags.jornada === "number" ? s.flags.jornada : 1;
  if (jornada < 1 && !c.p.office_code) c.st.energy = Math.min(100, c.st.energy + (1 - jornada) * 8);
  const q = (annualMortality(age) * healthFactor(s.health)) / 365;
  if (c.rng.chance(q)) endCareer(c, "MORTE", causeOfDeath(c, age));
}

function causeOfDeath(c: StoryCtx, age: number): string {
  const options =
    age < 45
      ? ["um acidente de trânsito", "um infarto fulminante", "complicações de uma doença rara"]
      : age < 70
        ? ["um infarto", "um AVC", "um câncer descoberto tarde", "complicações cardíacas"]
        : ["causas naturais", "complicações cardíacas", "insuficiência respiratória", "um AVC"];
  return c.rng.pick(options);
}

/** Encerra a carreira (morte ou aposentadoria) e fecha mandatos, candidaturas e filiação. */
export function endCareer(c: StoryCtx, cause: CareerEnd["cause"], detail: string): void {
  const { ctx, p, st, s } = c;
  if (s.ended) return;
  const age = ageAt(p.birth_year, ctx.date);
  s.ended = { on: ctx.date, age, cause, detail };
  s.pending = [];
  s.queue = [];
  st.offers = [];
  const highest = highestOffice(ctx, p);
  for (const m of ctx.t.mandates.values()) {
    if (m.person_id !== p.id || (m.status !== "ATIVO" && m.status !== "FUTURO")) continue;
    m.status = "ENCERRADO";
    if (m.end_on > ctx.date) m.end_on = ctx.date;
    ctx.save("mandates", m);
  }
  for (const cand of ctx.t.candidacies.values()) {
    if (cand.person_id !== p.id || !["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"].includes(cand.status)) continue;
    cand.status = "DESISTENTE";
    cand.note = cause === "MORTE" ? "Candidatura encerrada pelo falecimento." : "Candidatura retirada: aposentadoria da vida pública.";
    ctx.save("candidacies", cand);
  }
  for (const m of ctx.t.memberships.values()) {
    if (m.person_id === p.id && m.status === "ATIVA") {
      m.status = "ENCERRADA";
      m.left_on = ctx.date;
      ctx.save("memberships", m);
    }
  }
  p.office_code = null;
  p.office_geo = null;
  p.status = "RETIRED";
  p.status_note = cause === "MORTE" ? `Faleceu em ${formatDatePt(ctx.date)}, aos ${age} anos.` : `Aposentou-se da vida pública em ${formatDatePt(ctx.date)}.`;
  const title = cause === "MORTE" ? `Morre ${p.name}, aos ${age} anos` : `${p.name} se aposenta da vida pública`;
  const body =
    cause === "MORTE"
      ? `${p.name} morreu em ${formatDatePt(ctx.date)}, aos ${age} anos, de ${detail}.${highest ? ` Foi ${highest.toLowerCase()}.` : ""} ${p.party_id ? `Era filiado(a) ao ${ctx.t.parties.get(p.party_id)?.acronym ?? "partido"}.` : ""}`.trim()
      : `${p.name}, ${age} anos, anunciou que deixa a vida pública.${highest ? ` Foi ${highest.toLowerCase()}.` : ""}`;
  pushLog(s, { id: ctx.id("sty", p.id, "fim"), def: "fim_da_carreira", on: ctx.date, title, tags: ["VIDA"], kind: "INFO", outcome: body, milestone: true });
  if (highest || p.reputation >= 40) ctx.publish("WORLD_EVENT", { facts: { title, body }, personIds: [p.id], geography: p.uf, importance: highest ? 2 : 1 });
  else ctx.careerNews(p.id, title, body);
  ctx.notify(p.id, cause === "MORTE" ? "Fim da jornada" : "Carreira encerrada", body, "/jogo/fim");
  ctx.emit(cause === "MORTE" ? "PLAYER_DEATH" : "PLAYER_RETIREMENT", { actors: [p.id], geography: p.uf, payload: { age, detail } });
  p.party_id = null;
  p.faction_id = null;
  ctx.save("persons", p);
  ctx.save("person_states", st);
}

function highestOffice(ctx: Ctx, p: PersonRow): string | null {
  const codes = new Set<OfficeCode>();
  if (p.office_code) codes.add(p.office_code);
  for (const m of ctx.t.mandates.values()) if (m.person_id === p.id && m.status !== "FUTURO") codes.add(m.office_code);
  const best = [...codes].sort((a, b) => OFFICES[b].rank - OFFICES[a].rank)[0];
  return best ? OFFICES[best].name : null;
}

// ---------------------------------------------------------------------------
// Resumo da carreira
// ---------------------------------------------------------------------------

export interface CareerSummary {
  name: string;
  birthYear: number;
  endYear: number;
  end: CareerEnd;
  city: string;
  uf: string;
  profession: string;
  title: { label: string; text: string };
  epitaph: string;
  highestOffice: string | null;
  offices: Array<{ office: string; place: string; from: string; to: string }>;
  elections: Array<{ year: number; office: string; place: string; result: string; votes: number; share: number; won: boolean }>;
  parties: Array<{ acronym: string; name: string; color: string; from: string; to: string | null }>;
  achievements: Array<{ title: string; text: string; on: string; points: number }>;
  points: number;
  reputation: number;
  wealth: number;
  scandals: { acts: number; discovered: number; cases: number; convictions: number; kinds: string[] };
  allies: Array<{ name: string; role: string | null; score: number }>;
  enemies: number;
  milestones: StoryLogEntry[];
  stats: { events: number; answered: number; ignored: number; bold: number; risky: number; illegal: number; safe: number; years: number };
}

const RESULT_LABEL: Record<string, string> = {
  ELEITO: "eleito(a)",
  NAO_ELEITO: "não eleito(a)",
  SUPLENTE: "suplente",
  INDEFERIDA: "candidatura barrada",
  DESISTENTE: "desistiu",
  SEGUNDO_TURNO: "2º turno",
  HOMOLOGADA: "em disputa",
  PRE: "pré-candidatura",
};

export function careerSummary(ctx: Ctx, personId: string): CareerSummary | null {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  if (!p || !st) return null;
  const s = storyOf(st, p, ctx.date);
  const end: CareerEnd = s.ended ?? { on: ctx.date, age: ageAt(p.birth_year, ctx.date), cause: "APOSENTADORIA", detail: "" };
  const mandates = [...ctx.t.mandates.values()].filter((m) => m.person_id === p.id && m.status !== "FUTURO").sort((a, b) => a.start_on.localeCompare(b.start_on));
  const offices = mandates.map((m) => ({ office: OFFICES[m.office_code].name, place: geoName(m.geo, ctx.s), from: m.start_on, to: m.end_on }));
  const highest = [...mandates].sort((a, b) => OFFICES[b.office_code].rank - OFFICES[a.office_code].rank)[0];
  const elections = [...ctx.t.candidacies.values()]
    .filter((c) => c.person_id === p.id && c.status !== "PRE")
    .map((c) => ({
      year: Number(ctx.t.elections.get(c.election_id)?.year ?? c.election_id.replace(/\D/g, "")),
      office: OFFICES[c.office_code].name,
      place: geoName(c.geo, ctx.s),
      result: RESULT_LABEL[c.status] ?? c.status.toLowerCase(),
      votes: c.votes,
      share: c.vote_share,
      won: c.status === "ELEITO",
    }))
    .sort((a, b) => a.year - b.year);
  const parties = [...ctx.t.memberships.values()]
    .filter((m) => m.person_id === p.id)
    .sort((a, b) => a.joined_on.localeCompare(b.joined_on))
    .map((m) => {
      const party = ctx.t.parties.get(m.party_id);
      return { acronym: party?.acronym ?? "?", name: party?.name ?? "", color: party?.color ?? "#666", from: m.joined_on, to: m.left_on };
    });
  const achievements = Object.entries(st.achievements ?? {})
    .map(([id, on]) => ({ title: ACHIEVEMENT_BY_ID[id]?.title ?? id, text: ACHIEVEMENT_BY_ID[id]?.text ?? "", on, points: ACHIEVEMENT_BY_ID[id]?.points ?? 0 }))
    .sort((a, b) => a.on.localeCompare(b.on));
  const acts = [...ctx.t.illicit_acts.values()].filter((a) => a.person_id === p.id);
  const cases = [...ctx.t.investigations.values()].filter((i) => i.person_id === p.id);
  const convictions = cases.filter((i) => i.outcome === "CONDENADO").length;
  const rels = [...ctx.t.relationships.values()].filter((r) => r.a_id === p.id);
  const allies = rels
    .filter((r) => r.score >= 40)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((r) => ({ name: ctx.person(r.b_id)?.name ?? "?", role: ctx.person(r.b_id)?.role_label ?? null, score: Math.round(r.score) }));
  const milestones = s.log.filter((e) => e.milestone).slice(0, 16).reverse();
  const k = s.counters;
  const firstDate = s.log.length ? s.log[s.log.length - 1].on : ctx.date;
  const summary: CareerSummary = {
    name: p.name,
    birthYear: p.birth_year,
    endYear: year(end.on),
    end,
    city: cityLabel(ctx, p),
    uf: p.uf,
    profession: profession(p.profession.split("|")[0]).label,
    title: { label: "", text: "" },
    epitaph: "",
    highestOffice: highest ? OFFICES[highest.office_code].name : null,
    offices,
    elections,
    parties,
    achievements,
    points: careerScore(p, st),
    reputation: Math.round(p.reputation),
    wealth: Math.round(st.money + st.assets - st.debt),
    scandals: { acts: acts.length, discovered: acts.filter((a) => a.discovered).length, cases: cases.length, convictions, kinds: [...new Set(acts.filter((a) => a.discovered).map((a) => CRIMES[a.kind]?.label ?? a.kind))] },
    allies,
    enemies: rels.filter((r) => r.score <= -30).length,
    milestones,
    stats: {
      events: k.eventos ?? 0,
      answered: Math.max(0, (k.eventos ?? 0) - (k.sem_resposta ?? 0)),
      ignored: k.sem_resposta ?? 0,
      bold: k["tom:bold"] ?? 0,
      risky: k["tom:risky"] ?? 0,
      illegal: k["tom:illegal"] ?? 0,
      safe: k["tom:safe"] ?? 0,
      years: Math.max(0, Math.round(diffDays(end.on, firstDate) / 365)),
    },
  };
  summary.title = careerTitle(summary, ctx, p.id);
  summary.epitaph = epitaph(summary);
  return summary;
}

function careerTitle(sm: CareerSummary, ctx: Ctx, personId: string): { label: string; text: string } {
  const held = (name: string) => sm.offices.some((o) => o.office === name);
  const won = sm.elections.filter((e) => e.won).length;
  const lost = sm.elections.filter((e) => !e.won && ["não eleito(a)", "suplente"].includes(e.result)).length;
  const founder = [...ctx.t.parties.values()].some((x) => x.founder_id === personId && x.status === "ATIVO");
  if (held(OFFICES.PRESIDENTE.name)) return { label: "Chegou ao Planalto", text: "Fez o caminho inteiro, do bairro à Presidência da República." };
  if (sm.scandals.convictions > 0) return { label: "Caiu em desgraça", text: "A carreira terminou marcada por condenação na Justiça." };
  if (held(OFFICES.GOVERNADOR.name)) return { label: "Governou seu estado", text: "Chegou ao comando de um estado." };
  if (held(OFFICES.SENADOR.name)) return { label: "Voz no Senado", text: "Representou seu estado no Senado Federal." };
  if (sm.offices.length >= 4) return { label: "Raposa política", text: "Atravessou muitas eleições e sempre achou um jeito de voltar." };
  if (founder) return { label: "Fundador(a) de partido", text: "Criou um partido e o viu chegar às urnas." };
  if (held(OFFICES.PREFEITO.name)) return { label: "Comandou a cidade", text: "Foi prefeito(a) da própria cidade." };
  if (won === 0 && lost >= 3) return { label: "Eterno(a) candidato(a)", text: "Disputou muitas vezes e nunca desistiu de tentar." };
  if (held(OFFICES.DEP_FEDERAL.name)) return { label: "Voz em Brasília", text: "Teve mandato na Câmara dos Deputados." };
  if (held(OFFICES.DEP_ESTADUAL.name)) return { label: "Voz na Assembleia", text: "Teve mandato na Assembleia Legislativa." };
  if (held(OFFICES.VEREADOR.name)) return { label: "Voz da Câmara Municipal", text: "Representou o bairro e a cidade na Câmara." };
  if (sm.scandals.acts === 0 && sm.reputation >= 60) return { label: "Ficha limpa", text: "Construiu um nome respeitado sem nenhuma conduta ilegal." };
  if (sm.parties.length) return { label: "Militante de base", text: "Viveu a política por dentro do partido, longe dos holofotes." };
  return { label: "Cidadão(ã) engajado(a)", text: "Participou da vida da cidade sem disputar cargos." };
}

function epitaph(sm: CareerSummary): string {
  const parts: string[] = [`${sm.name} nasceu em ${sm.birthYear} e foi ${sm.profession} em ${sm.city}.`];
  const firstParty = sm.parties[0];
  if (firstParty) parts.push(`Filiou-se ao ${firstParty.acronym} em ${year(firstParty.from)}${sm.parties.length > 1 ? ` e passou por ${sm.parties.length} partidos` : ""}.`);
  const wins = sm.elections.filter((e) => e.won);
  const best = [...sm.elections].sort((a, b) => b.votes - a.votes)[0];
  if (wins.length) parts.push(`Venceu ${wins.length} eleição(ões)${best?.votes ? `; a maior votação foi de ${best.votes.toLocaleString("pt-BR")} votos, em ${best.year}` : ""}.`);
  else if (sm.elections.length) parts.push(`Disputou ${sm.elections.length} eleição(ões) sem vencer.`);
  if (sm.highestOffice) parts.push(`O cargo mais alto foi ${sm.highestOffice.toLowerCase()}.`);
  if (sm.scandals.convictions) parts.push(`Foi condenado(a) em ${sm.scandals.convictions} processo(s).`);
  else if (!sm.scandals.acts && (sm.elections.length || sm.parties.length)) parts.push("Nunca teve uma conduta ilegal registrada.");
  parts.push(sm.end.cause === "MORTE" ? `Morreu aos ${sm.end.age} anos, em ${sm.endYear}, de ${sm.end.detail}.` : `Deixou a vida pública aos ${sm.end.age} anos, em ${sm.endYear}.`);
  return parts.join(" ");
}
