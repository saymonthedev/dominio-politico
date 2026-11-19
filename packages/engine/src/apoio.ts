import { addDays, formatDatePt } from "./calendar";
import { isJailed } from "./crime";
import { checkEligibility, emptyCampaign, ensureRace, geoName, ufOfGeo } from "./elections";
import { canonicalGeo, isMunicipality } from "./geo";
import { relKey } from "./affiliation";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import { ballotNumber } from "./ticket";
import type { CandidacyRow, ElectionRow, Endorsement, PersonRow, PersonStateRow } from "./types";

/**
 * Apoio (sugestão do jogador Rian Andrade): o jogador declara apoio a candidaturas que escolher,
 * candidatos fictícios vêm pedir o apoio dele, e quem tem mandato e não concorre ao mesmo cargo indica
 * um sucessor (o prefeito no segundo mandato que quer fazer o sucessor). O apoio soma na votação de
 * quem recebe conforme a popularidade de quem apoia na região; depois da votação, quem apoiou ganha
 * prestígio se o candidato vencer e paga um preço se ele perder. É o espelho do padrinho político
 * (padrinho.ts): lá o jogador pede apoio, aqui ele apoia. Só jogadores e personagens fictícios entram:
 * pessoas reais não pedem nem recebem apoio de jogador.
 */

const LIVE = ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"];
/** Apoios por jogador numa eleição. */
export const MAX_ENDORSEMENTS = 6;
/** Pedidos de apoio esperando resposta, no máximo. */
const MAX_REQUESTS = 2;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** A eleição ainda aceita apoio (aberta e antes da votação de quem disputa). */
function openFor(ctx: Ctx, c: CandidacyRow): ElectionRow | undefined {
  const e = ctx.t.elections.get(c.election_id);
  if (!e || e.status === "ENCERRADA") return undefined;
  const decisive = c.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round;
  return decisive && ctx.date < decisive ? e : undefined;
}

/** A disputa é na região do jogador? (o país, o estado dele ou a cidade dele) */
function inRegion(me: PersonRow, geo: string): boolean {
  return geo === "BR" || geo === me.uf || (isMunicipality(geo) && canonicalGeo(geo) === canonicalGeo(me.municipality));
}

/** Popularidade de quem apoia na região: nome conhecido, reputação e aprovação (com mandato). */
export function endorserPopularity(ctx: Ctx, x: PersonRow, uf: string): number {
  const st = ctx.pstate(x.id);
  const approval = x.office_code && st?.story?.approval != null ? st.story.approval / 100 : null;
  const v = 0.55 * (st?.reach[uf] ?? 0) + 0.25 * (x.reputation / 100) + 0.2 * (approval ?? x.visibility / 100) - (st?.scandal ?? 0) / 200;
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

/** Quanto o apoio soma: no país, um nome local pesa menos; o sucessor leva a máquina de quem governa. */
function bonusOf(pop: number, geo: string, kind: Endorsement["kind"]): number {
  return Math.round((0.04 + 0.3 * pop) * (geo === "BR" ? 0.3 : 1) * (kind === "SUCESSOR" ? 1.5 : 1) * 100) / 100;
}

function roleOf(ctx: Ctx, x: PersonRow): string {
  if (x.office_code && x.office_geo) return `${OFFICES[x.office_code].name.toLowerCase()}${x.office_geo === "BR" ? "" : ` (${geoName(x.office_geo, ctx.s)})`}`;
  const party = x.party_id ? ctx.t.parties.get(x.party_id)?.acronym : null;
  return party ? `liderança do ${party}` : "liderança local";
}

function personLabel(ctx: Ctx, c: CandidacyRow): string {
  const x = ctx.person(c.person_id);
  const party = ctx.t.parties.get(c.party_id)?.acronym ?? "sem partido";
  return `${x?.name ?? "?"} (${party}) · ${OFFICES[c.office_code].name.toLowerCase()}${c.geo === "BR" ? "" : ` (${geoName(c.geo, ctx.s)})`}`;
}

/** Apoios que o jogador já declarou nesta eleição. */
function myEndorsements(ctx: Ctx, me: PersonRow, electionId: string): CandidacyRow[] {
  return [...ctx.t.candidacies.values()].filter((c) => c.election_id === electionId && (c.campaign.apoios ?? []).some((a) => a.id === me.id));
}

/** Por que o jogador não pode apoiar agora (null = pode). */
export function endorseBlocked(ctx: Ctx, me: PersonRow, st: PersonStateRow): string | null {
  if (isJailed(st, ctx.date)) return "Preso(a), você não faz campanha para ninguém.";
  if (!me.party_id && !me.office_code) return "Apoio pesa para quem está na política: filie-se a um partido ou tenha um mandato.";
  if (!endorseTargets(ctx, me).length) return "Nenhuma candidatura na sua região aceita apoio agora (disputas na sua cidade, no seu estado ou para presidente, antes da votação).";
  return null;
}

/**
 * Candidaturas que o jogador pode apoiar: vivas, na região dele, de jogadores ou personagens
 * fictícios, numa disputa em que ele não concorre e ainda não apoiou ninguém.
 */
export function endorseTargets(ctx: Ctx, me: PersonRow): CandidacyRow[] {
  const mine = [...ctx.t.candidacies.values()].filter((c) => c.person_id === me.id && LIVE.includes(c.status));
  const myRaces = new Set(mine.map((c) => c.race_id));
  const backedRaces = new Set<string>();
  const perElection = new Map<string, number>();
  for (const c of ctx.t.candidacies.values()) {
    if (!(c.campaign.apoios ?? []).some((a) => a.id === me.id)) continue;
    backedRaces.add(c.race_id);
    perElection.set(c.election_id, (perElection.get(c.election_id) ?? 0) + 1);
  }
  return [...ctx.t.candidacies.values()].filter((c) => {
    if (!LIVE.includes(c.status) || c.person_id === me.id || myRaces.has(c.race_id) || backedRaces.has(c.race_id)) return false;
    if ((perElection.get(c.election_id) ?? 0) >= MAX_ENDORSEMENTS || !inRegion(me, c.geo) || !openFor(ctx, c)) return false;
    const x = ctx.person(c.person_id);
    return !!x && x.status === "ACTIVE" && (x.kind === "PLAYER" || x.kind === "FICTIONAL_GENERATED");
  });
}

export function endorseOptions(ctx: Ctx, me: PersonRow): Array<{ value: string; label: string }> {
  return endorseTargets(ctx, me)
    .sort((a, b) => OFFICES[b.office_code].rank - OFFICES[a.office_code].rank || personLabel(ctx, a).localeCompare(personLabel(ctx, b), "pt-BR"))
    .slice(0, 60)
    .map((c) => ({ value: c.id, label: `${personLabel(ctx, c)}${c.party_id === me.party_id ? " · do seu partido" : ""}` }));
}

/** Seu partido tem candidatura própria nessa disputa majoritária (e o apoio vai para outro)? */
function againstOwnParty(ctx: Ctx, me: PersonRow, c: CandidacyRow): boolean {
  if (!me.party_id || c.party_id === me.party_id || (c.campaign.coalition ?? []).includes(me.party_id)) return false;
  if (OFFICES[c.office_code].system !== "MAJORITARIO") return false;
  return [...ctx.t.candidacies.values()].some((x) => x.race_id === c.race_id && x.party_id === me.party_id && LIVE.includes(x.status));
}

/** Registra o apoio na candidatura e avisa quem recebe. */
function addEndorsement(ctx: Ctx, me: PersonRow, c: CandidacyRow, kind: Endorsement["kind"]): Endorsement {
  const pop = endorserPopularity(ctx, me, ufOfGeo(c.geo === "BR" ? me.uf : c.geo));
  const a: Endorsement = { id: me.id, name: me.name, role: me.kind === "PLAYER" && !me.office_code ? "jogador(a)" : roleOf(ctx, me), bonus: bonusOf(pop, c.geo, kind), on: ctx.date, kind };
  c.campaign.apoios = [...(c.campaign.apoios ?? []).filter((x) => x.id !== me.id), a];
  ctx.save("candidacies", c);
  const x = ctx.person(c.person_id);
  if (x?.kind === "PLAYER")
    ctx.notify(x.id, kind === "SUCESSOR" ? "Você foi indicado(a) para a sucessão!" : "Novo apoio à sua candidatura", `${me.name} (${a.role}) declarou apoio à sua candidatura${kind === "SUCESSOR" ? " como sucessor(a) no cargo" : ""}. O apoio soma na votação enquanto ${me.name.split(" ")[0]} seguir na vida pública.`, "/jogo/campanha");
  return a;
}

/** Declarar apoio (ação do jogador). */
export function declareSupport(ctx: Ctx, me: PersonRow, st: PersonStateRow, candidacyId: string): { ok: boolean; message: string } {
  const blocked = endorseBlocked(ctx, me, st);
  if (blocked) return { ok: false, message: blocked };
  const c = endorseTargets(ctx, me).find((x) => x.id === candidacyId);
  if (!c) return { ok: false, message: "Essa candidatura não pode receber seu apoio (fora da sua região, já votou, você disputa a mesma vaga ou já apoiou alguém nela)." };
  const x = ctx.person(c.person_id)!;
  const disloyal = againstOwnParty(ctx, me, c);
  const a = addEndorsement(ctx, me, c, "APOIO");
  if (disloyal) st.party_standing = clamp(st.party_standing - 15);
  st.political_capital = clamp(st.political_capital - 1);
  if (x.kind === "FICTIONAL_GENERATED") bumpRel(ctx, me.id, x.id, 6);
  ctx.save("person_states", st);
  const gain = Math.round(a.bonus * 100);
  return {
    ok: true,
    message: `Você declarou apoio a ${personLabel(ctx, c)}. Pela sua popularidade na região, a campanha ganha cerca de ${gain} pontos de fôlego. Se vencer, você ganha prestígio; se perder, paga um preço.${disloyal ? " Seu partido tem candidatura própria nessa disputa: a direção não gostou (−15 de prestígio no partido)." : ""}`,
  };
}

function bumpRel(ctx: Ctx, a: string, b: string, delta: number): void {
  const id = relKey(a, b);
  const row = ctx.t.relationships.get(id) ?? { id, world_id: ctx.world.id, a_id: a, b_id: b, score: 0, interactions: 0, last_on: ctx.date };
  row.score = Math.max(-100, Math.min(100, row.score + delta));
  row.interactions += 1;
  row.last_on = ctx.date;
  ctx.save("relationships", row);
}

// ---------------------------------------------------------------------------
// Pedidos de apoio: candidatos fictícios procuram o jogador
// ---------------------------------------------------------------------------

/** Peso do jogador para ser procurado: mandato, nome conhecido ou prestígio no partido. */
function clout(ctx: Ctx, p: PersonRow, st: PersonStateRow): number {
  if (p.office_code) return 0.35;
  if ((st.reach[p.uf] ?? 0) >= 0.2 || st.party_standing >= 60) return 0.15;
  return 0;
}

/** Toda semana, na campanha: um candidato fictício da região pode pedir o apoio do jogador. */
export function weeklySupportRequests(ctx: Ctx): void {
  const campaigning = [...ctx.t.elections.values()].filter((e) => e.status === "CAMPANHA" && ctx.date >= e.calendar.campaignStart && ctx.date < e.first_round);
  if (!campaigning.length) return;
  const ids = new Set(campaigning.map((e) => e.id));
  const cands = [...ctx.t.candidacies.values()].filter((c) => ids.has(c.election_id) && c.status === "HOMOLOGADA" && OFFICES[c.office_code].system === "MAJORITARIO" && ctx.person(c.person_id)?.kind === "FICTIONAL_GENERATED");
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st || isJailed(st, ctx.date)) continue;
    const chance = clout(ctx, p, st);
    const rng = ctx.rng("pedido-apoio", p.id);
    if (!chance || !rng.chance(chance)) continue;
    const s = storyOf(st, p, ctx.date);
    s.apoio_pedidos = (s.apoio_pedidos ?? []).filter((r) => r.until > ctx.date && ctx.t.candidacies.get(r.cand)?.status === "HOMOLOGADA");
    if (s.apoio_pedidos.length >= MAX_REQUESTS) continue;
    const asked = new Set([...(s.apoio_recusados ?? []), ...s.apoio_pedidos.map((r) => r.cand)]);
    const allowed = new Set(endorseTargets(ctx, p).map((c) => c.id));
    const pool = cands.filter((c) => allowed.has(c.id) && !asked.has(c.id));
    if (!pool.length) continue;
    const c = rng.weighted(pool, (x) => (x.party_id === p.party_id || (x.campaign.coalition ?? []).includes(p.party_id ?? "") ? 3 : 1) * (OFFICES[x.office_code].rank + 1));
    const e = ctx.t.elections.get(c.election_id)!;
    const until = addDays(ctx.date, 14) < e.first_round ? addDays(ctx.date, 14) : e.first_round;
    s.apoio_pedidos.push({ id: ctx.id("ped", p.id, c.id), cand: c.id, from: c.person_id, on: ctx.date, until });
    ctx.save("person_states", st);
    ctx.notify(p.id, "Pedido de apoio", `${personLabel(ctx, c)} pede o seu apoio na campanha. Responda até ${formatDatePt(until)} na tela da carreira (Responder pedido de apoio).`, "/jogo/carreira");
  }
}

export function requestOptions(ctx: Ctx, me: PersonRow, st: PersonStateRow): Array<{ value: string; label: string }> {
  const list = (st.story?.apoio_pedidos ?? []).filter((r) => r.until > ctx.date);
  return list
    .map((r) => ({ r, c: ctx.t.candidacies.get(r.cand) }))
    .filter((x): x is { r: (typeof list)[number]; c: CandidacyRow } => !!x.c && x.c.status === "HOMOLOGADA")
    .map(({ r, c }) => ({ value: r.id, label: `${personLabel(ctx, c)} · até ${formatDatePt(r.until)}` }));
}

/** Responder a um pedido de apoio: aceitar declara o apoio; recusar esfria a relação. */
export function answerSupportRequest(ctx: Ctx, me: PersonRow, st: PersonStateRow, requestId: string, accept: boolean): { ok: boolean; message: string } {
  const s = storyOf(st, me, ctx.date);
  const req = (s.apoio_pedidos ?? []).find((r) => r.id === requestId);
  if (!req || req.until <= ctx.date) return { ok: false, message: "Esse pedido já expirou." };
  s.apoio_pedidos = (s.apoio_pedidos ?? []).filter((r) => r.id !== requestId);
  const c = ctx.t.candidacies.get(req.cand);
  if (!c || c.status !== "HOMOLOGADA") {
    ctx.save("person_states", st);
    return { ok: false, message: "Essa candidatura não está mais na disputa." };
  }
  if (!accept) {
    s.apoio_recusados = [...(s.apoio_recusados ?? []), c.id].slice(-40);
    bumpRel(ctx, me.id, c.person_id, -5);
    ctx.save("person_states", st);
    return { ok: true, message: `Você recusou o pedido de ${ctx.person(c.person_id)?.name ?? "da candidatura"}. A relação esfriou um pouco.` };
  }
  const r = declareSupport(ctx, me, st, c.id);
  if (r.ok) bumpRel(ctx, me.id, c.person_id, 8);
  ctx.save("person_states", st);
  return r;
}

// ---------------------------------------------------------------------------
// Sucessor: quem tem o cargo e não concorre a ele indica quem vai disputar
// ---------------------------------------------------------------------------

/** A próxima eleição do cargo do jogador, ainda antes da votação. */
function nextElectionFor(ctx: Ctx, office: OfficeCode): ElectionRow | undefined {
  return [...ctx.t.elections.values()]
    .filter((e) => e.status !== "ENCERRADA" && e.kind === OFFICES[office].election && ctx.date < e.first_round)
    .sort((a, b) => a.year - b.year)[0];
}

/** Por que não dá para indicar sucessor agora (null = dá). */
export function successorBlocked(ctx: Ctx, me: PersonRow): string | null {
  if (!me.office_code || !me.office_geo) return "Só quem tem mandato indica sucessor.";
  if (!me.party_id) return "Sem partido, não há chapa para indicar alguém.";
  const e = nextElectionFor(ctx, me.office_code);
  if (!e) return "Ainda não há eleição para o seu cargo à vista.";
  if (ctx.date < `${e.year - 1}${e.first_round.slice(4)}`) return `A sucessão se decide no ano anterior à eleição de ${e.year}.`;
  const running = [...ctx.t.candidacies.values()].some((c) => c.person_id === me.id && c.election_id === e.id && LIVE.includes(c.status) && c.office_code === me.office_code);
  if (running) return "Você disputa o mesmo cargo: não há sucessão a indicar.";
  const already = [...ctx.t.candidacies.values()].some((c) => c.election_id === e.id && (c.campaign.apoios ?? []).some((a) => a.id === me.id && a.kind === "SUCESSOR"));
  if (already) return "Você já indicou seu(sua) sucessor(a) para esta eleição.";
  if (!successorChoices(ctx, me).length) return "Ninguém do seu partido na sua região pode disputar o cargo agora (idade, filiação e domicílio).";
  return null;
}

/**
 * Quem pode ser o sucessor: jogadores do partido que já disputam o cargo (pré-candidatura ou
 * candidatura) e, antes das convenções, personagens fictícios do partido na região, elegíveis.
 */
export function successorChoices(ctx: Ctx, me: PersonRow): Array<{ person: PersonRow; candidacy?: CandidacyRow }> {
  if (!me.office_code || !me.office_geo || !me.party_id) return [];
  const e = nextElectionFor(ctx, me.office_code);
  if (!e) return [];
  const office = me.office_code;
  const geo = me.office_geo;
  const raceId = `${e.id}:${office}:${geo}`;
  const out = new Map<string, { person: PersonRow; candidacy?: CandidacyRow }>();
  for (const c of ctx.t.candidacies.values()) {
    if (c.race_id !== raceId || c.party_id !== me.party_id || !LIVE.includes(c.status) || c.person_id === me.id) continue;
    const x = ctx.person(c.person_id);
    if (x && x.status === "ACTIVE" && (x.kind === "PLAYER" || x.kind === "FICTIONAL_GENERATED")) out.set(x.id, { person: x, candidacy: c });
  }
  if (ctx.date < e.calendar.conventionEnd) {
    const here = (x: PersonRow) => (geo === "BR" ? true : geo.length === 2 ? x.uf === geo : canonicalGeo(x.municipality) === canonicalGeo(geo));
    const busy = new Set([...ctx.t.candidacies.values()].filter((c) => c.election_id === e.id && LIVE.includes(c.status)).map((c) => c.person_id));
    const pool = [...ctx.t.persons.values()]
      .filter((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE" && x.party_id === me.party_id && x.id !== me.id && !busy.has(x.id) && here(x))
      .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
    for (const x of pool) {
      if (out.size >= 30) break;
      if (checkEligibility(ctx, x, office, geo, e).ok) out.set(x.id, { person: x });
    }
  }
  return [...out.values()];
}

export function successorOptions(ctx: Ctx, me: PersonRow): Array<{ value: string; label: string }> {
  const year = Number(ctx.date.slice(0, 4));
  return successorChoices(ctx, me).map(({ person: x, candidacy }) => ({
    value: x.id,
    label: `${x.name}${x.kind === "PLAYER" ? " (jogador(a))" : ""} · ${year - x.birth_year} anos · reputação ${Math.round(x.reputation)}${candidacy ? ` · ${candidacy.status === "PRE" ? "pré-candidato(a)" : "candidato(a)"}` : ""}`,
  }));
}

/** Indicar o sucessor: a candidatura (criada se preciso) leva o apoio de quem governa e a preferência na convenção. */
export function indicateSuccessor(ctx: Ctx, me: PersonRow, st: PersonStateRow, personId: string): { ok: boolean; message: string } {
  const blocked = successorBlocked(ctx, me);
  if (blocked) return { ok: false, message: blocked };
  const pick = successorChoices(ctx, me).find((x) => x.person.id === personId);
  if (!pick) return { ok: false, message: "Essa pessoa não pode ser sua sucessora (partido, região, idade ou já disputa outra vaga)." };
  const office = me.office_code!;
  const geo = me.office_geo!;
  const e = nextElectionFor(ctx, office)!;
  let c = pick.candidacy;
  if (!c) {
    const race = ensureRace(ctx, e, office, geo);
    const party = ctx.t.parties.get(me.party_id!)!;
    c = {
      id: ctx.id("cand", race.id, pick.person.id),
      world_id: ctx.world.id,
      election_id: e.id,
      race_id: race.id,
      person_id: pick.person.id,
      party_id: party.id,
      office_code: office,
      geo,
      status: "PRE",
      is_player: false,
      ballot_number: ballotNumber(ctx, party, office, race.id, pick.person.id),
      campaign: emptyCampaign(),
      votes: 0,
      vote_share: 0,
      note: `Pré-candidatura de sucessão indicada por ${me.name}`,
    };
    pick.person.stage = "PRE_CANDIDATO";
    ctx.save("persons", pick.person);
  }
  const a = addEndorsement(ctx, me, c, "SUCESSOR");
  bumpRel(ctx, me.id, pick.person.id, 10);
  st.political_capital = clamp(st.political_capital - 3);
  ctx.save("person_states", st);
  const name = OFFICES[office].name.toLowerCase();
  ctx.careerNews(me.id, `${me.name} indica ${pick.person.name} como sucessor(a)`, `${me.name} anuncia que ${pick.person.name} é o nome do grupo para ${name}${geo === "BR" ? "" : ` em ${geoName(geo, ctx.s)}`} em ${e.year}.`);
  return {
    ok: true,
    message: `${pick.person.name} é seu(sua) sucessor(a) para ${name} em ${e.year}. ${c.status === "PRE" ? "Na convenção, a indicação de quem tem o cargo pesa muito. " : ""}Na campanha, sua aprovação e seu nome somam cerca de ${Math.round(a.bonus * 100)} pontos de fôlego. Se ${pick.person.name.split(" ")[0]} vencer, o seu legado cresce; se perder, você paga o preço.`,
  };
}

// ---------------------------------------------------------------------------
// Depois da votação: prestígio ou desgaste de quem apoiou
// ---------------------------------------------------------------------------

export function settleEndorsements(ctx: Ctx, e: ElectionRow): void {
  for (const c of ctx.t.candidacies.values()) {
    if (c.election_id !== e.id || !c.campaign.apoios?.length) continue;
    if (c.status !== "ELEITO" && c.status !== "NAO_ELEITO" && c.status !== "SUPLENTE" && c.status !== "INDEFERIDA" && c.status !== "DESISTENTE") continue;
    let changed = false;
    for (const a of c.campaign.apoios) {
      if (a.settled) continue;
      a.settled = true;
      changed = true;
      const x = ctx.person(a.id);
      const st = x ? ctx.pstate(x.id) : undefined;
      if (!x || !st || x.kind !== "PLAYER" || x.status !== "ACTIVE") continue;
      if (c.status === "INDEFERIDA" || c.status === "DESISTENTE") continue;
      const won = c.status === "ELEITO";
      const sucessor = a.kind === "SUCESSOR";
      st.political_capital = clamp(st.political_capital + (won ? (sucessor ? 8 : 4) : sucessor ? -5 : -2));
      x.reputation = clamp(x.reputation + (won ? (sucessor ? 3 : 1) : sucessor ? -2 : 0));
      ctx.save("person_states", st);
      ctx.save("persons", x);
      bumpRel(ctx, x.id, c.person_id, won ? 10 : 2);
      const who = ctx.person(c.person_id)?.name ?? "quem você apoiou";
      const office = OFFICES[c.office_code].name.toLowerCase();
      ctx.notify(
        x.id,
        won ? (sucessor ? "Seu sucessor venceu!" : "Quem você apoiou venceu") : sucessor ? "Seu sucessor perdeu" : "Quem você apoiou perdeu",
        won
          ? `${who} venceu para ${office}. ${sucessor ? "O seu grupo segue no cargo e o seu legado cresce" : "Você sai fortalecido(a)"} (capital político ${sucessor ? "+8" : "+4"}).`
          : `${who} não venceu para ${office}. Seu apoio custou caro (capital político ${sucessor ? "−5" : "−2"}).`,
        "/jogo/carreira",
      );
    }
    if (changed) ctx.save("candidacies", c);
  }
}
