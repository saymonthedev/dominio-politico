import type { ActionDef, ActionResult } from "./actions";
import { bumpApproval } from "./approval";
import { addDays, addMonths, formatDatePt } from "./calendar";
import { geoName, ufOfGeo } from "./elections";
import { genderOf, officeTitle } from "./gender";
import { isCapital, UF_BY_CODE } from "./geo";
import { ideologyAffinity, type Axis } from "./ideology";
import { ensureState, spawnProceduralCadre } from "./npc";
import { partyPostOf } from "./partypost";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { BillRow, ImpeachmentInfo, MandateRow, PartyRow, PersonRow, VoteChoice, VotePanel, VotePanelParty } from "./types";

/**
 * Plenário (sugestão do jogador Gabriel do Valle): cada votação vira um painel com o placar de sim,
 * não, abstenção e ausentes, o mínimo exigido e o voto de cada bancada e de cada jogador; projeto
 * aprovado na Câmara dos Deputados segue para o Senado; e prefeito, governador ou presidente com o
 * governo em frangalhos pode sofrer impeachment (Câmara Municipal, Assembleia ou Câmara e Senado).
 *
 * Pessoas reais nunca são alvo de impeachment: o processo só existe contra personagens fictícios e
 * jogadores, como os crimes.
 */

export const CHAMBER_CAMARA = "CAMARA";
export const CHAMBER_SENADO = "SENADO";

/** A Casa em que a pessoa vota (pelo cargo de agora), ou null. */
export function chamberOf(p: Pick<PersonRow, "office_code" | "office_geo"> | null | undefined): string | null {
  if (!p?.office_code) return null;
  if (p.office_code === "DEP_FEDERAL") return CHAMBER_CAMARA;
  if (p.office_code === "SENADOR") return CHAMBER_SENADO;
  if (p.office_code === "DEP_ESTADUAL" && p.office_geo) return `ASSEMBLEIA:${p.office_geo}`;
  if (p.office_code === "VEREADOR" && p.office_geo) return `MUNICIPAL:${p.office_geo}`;
  return null;
}

/** Nome da Casa para as telas e as notícias. */
export function chamberName(chamber: string, s?: { cities?: Ctx["s"]["cities"] }): string {
  if (chamber === CHAMBER_CAMARA) return "Câmara dos Deputados";
  if (chamber === CHAMBER_SENADO) return "Senado Federal";
  const [kind, geo = ""] = chamber.split(":");
  if (kind === "ASSEMBLEIA") return geo === "DF" ? "Câmara Legislativa do Distrito Federal" : `Assembleia Legislativa ${UF_BY_CODE[geo] ? `de ${UF_BY_CODE[geo].name}` : ""}`.trim();
  return `Câmara Municipal de ${geoName(geo, s)}`;
}

/** Cadeiras da Casa quando não há registro de bancadas (cidade do interior sem eleição completa, por exemplo). */
const DEFAULT_SEATS: Record<string, number> = { CAMARA: 513, SENADO: 81, ASSEMBLEIA: 24, MUNICIPAL: 11 };

/** Bancadas da Casa: cadeiras de cada partido. */
export function chamberSeats(ctx: Ctx, chamber: string): Array<{ party: PartyRow; seats: number }> {
  const [kind, geo = ""] = chamber.split(":");
  const key = kind === "CAMARA" ? "camara" : kind === "SENADO" ? "senado" : kind === "ASSEMBLEIA" ? `assembleia_${geo}` : isCapital(geo) ? `camara_mun_${ufOfGeo(geo)}` : null;
  const parties = [...ctx.t.parties.values()].sort((a, b) => a.id.localeCompare(b.id));
  let out = key ? parties.map((party) => ({ party, seats: Math.max(0, Math.round(party.seats[key] ?? 0)) })).filter((x) => x.seats > 0) : [];
  if (!out.length && (kind === "ASSEMBLEIA" || kind === "MUNICIPAL")) {
    // pelos mandatos em exercício que o mundo guarda (a cidade do jogador, por exemplo)
    const office: OfficeCode = kind === "ASSEMBLEIA" ? "DEP_ESTADUAL" : "VEREADOR";
    const count = new Map<string, number>();
    for (const m of ctx.t.mandates.values()) {
      if (m.status !== "ATIVO" || m.office_code !== office || m.geo !== geo) continue;
      const party = ctx.person(m.person_id)?.party_id;
      if (party) count.set(party, (count.get(party) ?? 0) + 1);
    }
    out = parties.filter((p) => count.has(p.id)).map((party) => ({ party, seats: count.get(party.id)! }));
  }
  if (!out.length) {
    // sem registro: as cadeiras padrão repartidas pela força dos partidos no estado (maiores médias)
    const uf = kind === "CAMARA" || kind === "SENADO" ? null : ufOfGeo(geo);
    const strength = (p: PartyRow) => (uf ? p.territory[uf] ?? 0 : Object.values(p.territory).reduce((s, v) => s + v, 0));
    const live = parties.filter((p) => p.status === "ATIVO" && strength(p) > 0);
    const got = new Map<string, number>();
    for (let i = 0; i < DEFAULT_SEATS[kind] && live.length; i++) {
      let best = live[0];
      let bestQ = -1;
      for (const p of live) {
        const q = strength(p) / ((got.get(p.id) ?? 0) + 1);
        if (q > bestQ) {
          bestQ = q;
          best = p;
        }
      }
      got.set(best.id, (got.get(best.id) ?? 0) + 1);
    }
    out = live.filter((p) => got.has(p.id)).map((party) => ({ party, seats: got.get(party.id)! }));
  }
  return out;
}

/** Orientação de bancada dada pelo jogador que preside o partido nacionalmente (nas flags da história). */
function playerOrientation(ctx: Ctx, partyId: string, billId: string): VoteChoice | null {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE" || p.party_id !== partyId) continue;
    const st = ctx.pstate(p.id);
    if (partyPostOf(ctx.s, p, st)?.level !== "PRES_NACIONAL") continue;
    const v = st?.story?.flags[`orientacao:${billId}`];
    if (v === "SIM" || v === "NAO") return v;
  }
  return null;
}

type VoteKind = "PL" | "PEC" | "IMPEACHMENT";

/**
 * Uma votação no plenário: cada cadeira vota conforme a posição da bancada (com a disciplina do
 * partido), parte falta e parte se abstém; os jogadores da Casa votam por conta própria.
 */
function runVote(ctx: Ctx, bill: BillRow, kind: VoteKind, step: string, support: (party: PartyRow) => number): VotePanel {
  const chamber = bill.chamber;
  const seats = chamberSeats(ctx, chamber);
  const total = seats.reduce((s, x) => s + x.seats, 0);
  const rng = ctx.rng("plenario", `${bill.id}:${chamber}:${step}`);
  // votos dos jogadores que têm cadeira nesta Casa
  const players: Record<string, VoteChoice> = {};
  const byParty = new Map<string, VoteChoice[]>();
  for (const [pid, v] of Object.entries(bill.player_votes ?? {})) {
    const p = ctx.person(pid);
    if (!p || p.status !== "ACTIVE" || chamberOf(p) !== chamber) continue;
    players[pid] = v;
    const key = p.party_id ?? "";
    byParty.set(key, [...(byParty.get(key) ?? []), v]);
  }
  const absentRate = kind === "IMPEACHMENT" ? 0.02 : 0.05;
  const parties: VotePanelParty[] = [];
  for (const { party, seats: n } of seats) {
    let s = support(party);
    const forced = kind === "IMPEACHMENT" ? null : playerOrientation(ctx, party.id, bill.id);
    if (forced === "SIM") s = 0.9;
    else if (forced === "NAO") s = 0.1;
    const mine = byParty.get(party.id) ?? [];
    const row: VotePanelParty = { id: party.id, acronym: party.acronym, seats: n, yes: 0, no: 0, abstain: 0, absent: 0, orientation: forced ?? (Math.abs(s - 0.5) < 0.08 ? "LIBERADA" : s > 0.5 ? "SIM" : "NAO") };
    const p = party.discipline * (s > 0.5 ? 1 : 0) + (1 - party.discipline) * s;
    for (let i = mine.length; i < n; i++) {
      const r = rng.float();
      if (r < absentRate) row.absent++;
      else if (r < absentRate + 0.03) row.abstain++;
      else if (rng.float() < p) row.yes++;
      else row.no++;
    }
    for (const v of mine.slice(0, n)) {
      if (v === "SIM") row.yes++;
      else if (v === "NAO") row.no++;
      else row.abstain++;
    }
    parties.push(row);
  }
  parties.sort((a, b) => b.seats - a.seats || a.acronym.localeCompare(b.acronym));
  const sum = (k: "yes" | "no" | "abstain" | "absent") => parties.reduce((s, x) => s + x[k], 0);
  const yes = sum("yes");
  const no = sum("no");
  const abstain = sum("abstain");
  const absent = sum("absent");
  let needed: number;
  let rule: string;
  let approved: boolean;
  if (kind === "PEC") {
    needed = Math.ceil((total * 3) / 5);
    rule = `3/5 da Casa: ${needed} votos sim`;
    approved = yes >= needed;
  } else if (kind === "IMPEACHMENT") {
    needed = Math.ceil((total * 2) / 3);
    rule = `2/3 da Casa: ${needed} votos sim`;
    approved = yes >= needed;
  } else {
    needed = Math.floor(total / 2) + 1;
    rule = `maioria dos votos, com pelo menos ${needed} presentes`;
    approved = yes + no + abstain >= needed && yes > no;
  }
  return { chamber, house: chamberName(chamber, ctx.s), date: ctx.date, seats: total, yes, no, abstain, absent, needed, rule, approved, step, parties, players };
}

/** Avisa os jogadores que têm cadeira na Casa do resultado do painel. */
function notifyMembers(ctx: Ctx, panel: VotePanel, title: string): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE" || chamberOf(p) !== panel.chamber) continue;
    const mine = panel.players[p.id];
    ctx.notify(
      p.id,
      `Painel de votação: ${panel.approved ? "aprovado" : "rejeitado"}`,
      `${title} (${panel.step.toLowerCase()}): ${panel.yes} sim, ${panel.no} não, ${panel.abstain} abstenções e ${panel.absent} ausentes, em ${panel.house}. ${panel.rule.replace(/^./, (c) => c.toUpperCase())}.${mine ? ` Seu voto: ${mine === "NAO" ? "não" : mine === "SIM" ? "sim" : "abstenção"}.` : ""}`,
      "/jogo/governo#votacoes",
    );
  }
}

const isPec = (b: BillRow) => b.title.startsWith("PEC");
export const isImpeachment = (b: Pick<BillRow, "axis">) => b.axis === "impeachment";

/** Diário: projetos e processos de impeachment com votação marcada para hoje. */
export function dailyVotes(ctx: Ctx): void {
  for (const bill of [...ctx.t.bills.values()]) {
    if (bill.status !== "TRAMITANDO" || bill.vote_on > ctx.date) continue;
    if (isImpeachment(bill)) voteImpeachment(ctx, bill);
    else voteBill(ctx, bill);
  }
}

/** Projeto de lei ou PEC: Câmara dos Deputados e, se aprovado, Senado; aprovado nas duas, vai à sanção. */
function voteBill(ctx: Ctx, bill: BillRow): void {
  const federal = bill.chamber === CHAMBER_CAMARA || bill.chamber === CHAMBER_SENADO;
  const support = (party: PartyRow) => {
    const position = (party.ideology[bill.axis as Axis] ?? 0) * bill.direction;
    const govPull = federal ? bill.gov_position * party.gov_alignment * 30 : 0;
    return 1 / (1 + Math.exp(-(position + govPull) / 25));
  };
  const kind: VoteKind = isPec(bill) ? "PEC" : "PL";
  const atCamara = bill.chamber === CHAMBER_CAMARA;
  const panel = runVote(ctx, bill, kind, atCamara ? "Votação na Câmara" : "Votação no Senado", support);
  // consequências dos votos dos jogadores (orientação do partido e eleitorado)
  for (const [pid, v] of Object.entries(panel.players)) {
    const p = ctx.person(pid);
    if (p) playerVoteConsequences(ctx, p, bill, v);
  }
  const panels = [...(bill.votes.panels ?? []), panel];
  bill.votes = { ...bill.votes, yes: panel.yes, no: panel.no, abstain: panel.abstain, panels };
  const govNote = bill.gov_position === 0 ? "O governo liberou a bancada." : (bill.gov_position > 0) === panel.approved ? "Vitória do governo no plenário." : "Derrota para o governo no plenário.";
  notifyMembers(ctx, panel, bill.title);
  if (panel.approved && atCamara) {
    // segue para o Senado: nova votação, com os senadores
    bill.chamber = CHAMBER_SENADO;
    bill.vote_on = addDays(ctx.date, ctx.rng("senado", bill.id).int(14, 40));
    bill.player_votes = {};
    ctx.save("bills", bill);
    ctx.publish("BILL_VOTE", { facts: { chamber: "Câmara", result: "aprova", title: bill.title, yes: panel.yes, no: panel.no, govNote: `${govNote} O texto segue para o Senado, que vota em ${formatDatePt(bill.vote_on)}.` } });
    for (const p of ctx.t.persons.values()) {
      if (p.kind === "PLAYER" && p.status === "ACTIVE" && p.office_code === "SENADOR") ctx.notify(p.id, "Projeto chega ao Senado", `${bill.title}. Votação no Senado em ${formatDatePt(bill.vote_on)}.`, "/jogo/governo#votacoes");
    }
    return;
  }
  bill.status = panel.approved ? "APROVADO" : "REJEITADO";
  ctx.save("bills", bill);
  if (panel.approved && bill.fiscal_effect) {
    ctx.world.gov.fiscal_stance = Math.max(-1, Math.min(1, ctx.world.gov.fiscal_stance + bill.fiscal_effect * 0.5));
    ctx.saveWorld();
  }
  ctx.publish("BILL_VOTE", {
    facts: { chamber: atCamara ? "Câmara" : "Senado", result: panel.approved ? "aprova" : "rejeita", title: bill.title, yes: panel.yes, no: panel.no, govNote: panel.approved && !atCamara ? `${govNote} O texto vai à sanção.` : govNote },
  });
}

/** Voto do jogador num projeto: orientação do partido e o que o eleitorado do estado pensa. */
function playerVoteConsequences(ctx: Ctx, p: PersonRow, bill: BillRow, vote: VoteChoice): void {
  const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const st = ctx.pstate(p.id);
  if (!party || !st) return;
  const partyLine = (party.ideology[bill.axis as Axis] ?? 0) * bill.direction + bill.gov_position * party.gov_alignment * 30 > 0 ? "SIM" : "NAO";
  if (vote !== "ABSTENCAO" && vote !== partyLine) {
    st.party_standing = Math.max(0, st.party_standing - 8 * party.discipline);
    ctx.notify(p.id, "Voto contra a orientação", `Você votou contra a orientação do ${party.acronym}. A direção não gostou.`, "/jogo/governo");
  } else if (vote === partyLine) {
    st.party_standing = Math.min(100, st.party_standing + 2);
  }
  const segs = [...ctx.t.voter_segments.values()].filter((s) => s.uf === p.uf);
  const ufPosition = segs.reduce((s, sg) => s + (sg.ideology[bill.axis as Axis] ?? 0) * sg.weight, 0) * bill.direction;
  const aligned = (vote === "SIM" && ufPosition > 0) || (vote === "NAO" && ufPosition < 0);
  p.reputation = Math.max(0, Math.min(100, p.reputation + (aligned ? 1 : -1)));
  ctx.save("persons", p);
  ctx.save("person_states", st);
}

/* ---------------------------------------------------------------- impeachment */

const EXECUTIVE: ReadonlySet<string> = new Set(["PRESIDENTE", "GOVERNADOR", "PREFEITO"]);
const isReal = (p: PersonRow) => p.kind === "REAL_HISTORICAL" || p.kind === "REAL_ACTIVE_AT_SNAPSHOT";

/** Mandato de chefe do Executivo em exercício da pessoa (o maior, se tiver mais de um). */
export function executiveMandate(ctx: Ctx, personId: string): MandateRow | null {
  let best: MandateRow | null = null;
  for (const m of ctx.t.mandates.values()) {
    if (m.person_id !== personId || m.status !== "ATIVO" || !EXECUTIVE.has(m.office_code)) continue;
    if (!best || OFFICES[m.office_code].rank > OFFICES[best.office_code].rank) best = m;
  }
  return best;
}

/** Aprovação de quem governa: a do governo federal para o presidente; a do mandato para os outros. */
export function executiveApproval(ctx: Ctx, p: PersonRow, m: MandateRow): number {
  if (m.office_code === "PRESIDENTE") return ctx.world.gov.approval;
  if (p.kind === "PLAYER") return ctx.pstate(p.id)?.story?.approval ?? m.approval;
  return m.approval;
}

const underInvestigation = (ctx: Ctx, personId: string) => [...ctx.t.investigations.values()].some((i) => i.person_id === personId && i.outcome == null);

/** Processo de impeachment aberto contra a pessoa. */
export function openImpeachmentOf(ctx: Ctx, personId: string): BillRow | null {
  for (const b of ctx.t.bills.values()) if (b.status === "TRAMITANDO" && isImpeachment(b) && b.votes.impeachment?.target === personId) return b;
  return null;
}

/** Casa que julga cada chefe do Executivo (o presidente: a Câmara admite, o Senado julga). */
function impeachmentChamber(m: MandateRow): string {
  return m.office_code === "PRESIDENTE" ? CHAMBER_CAMARA : m.office_code === "GOVERNADOR" ? `ASSEMBLEIA:${m.geo}` : `MUNICIPAL:${m.geo}`;
}

/** Motivos que sustentam um pedido de impeachment agora (ou null, se não há base). */
export function impeachmentGrounds(ctx: Ctx, p: PersonRow, m: MandateRow): string | null {
  const st = ctx.pstate(p.id);
  const approval = Math.round(executiveApproval(ctx, p, m));
  const parts: string[] = [];
  if (st?.sentence) parts.push("condenação na Justiça");
  if (underInvestigation(ctx, p.id)) parts.push("investigação em andamento");
  if ((st?.scandal ?? 0) >= 30) parts.push("escândalos no governo");
  if (approval < 30) parts.push(`aprovação de ${approval}%`);
  return parts.length ? parts.join(", ") : null;
}

/** Dá para abrir processo contra esta pessoa? (nunca contra pessoa real, nem dois ao mesmo tempo, nem de novo antes de um ano) */
function impeachable(ctx: Ctx, p: PersonRow | undefined): p is PersonRow {
  if (!p || p.status !== "ACTIVE" || isReal(p)) return false;
  if (openImpeachmentOf(ctx, p.id)) return false;
  const last = ctx.world.stats?.[`imp:${p.id}`];
  return !(typeof last === "number" && ctx.tick - last < 365);
}

/** Abre o processo: a Casa marca a votação e o mundo fica sabendo. */
export function fileImpeachment(ctx: Ctx, target: PersonRow, m: MandateRow, reason: string, filer: PersonRow | null): BillRow {
  const rng = ctx.rng("impeachment-abre", target.id);
  const chamber = impeachmentChamber(m);
  const place = m.office_code === "PRESIDENTE" ? "do Brasil" : `de ${geoName(m.geo, ctx.s)}`;
  const role = officeTitle(m.office_code, genderOf(target)).toLowerCase();
  const opposition = [...ctx.t.parties.values()]
    .filter((x) => x.status === "ATIVO" && x.id !== target.party_id)
    .sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0) || a.id.localeCompare(b.id))[0];
  const info: ImpeachmentInfo = {
    target: target.id,
    name: target.name,
    office: m.office_code,
    geo: m.geo,
    reason,
    stage: m.office_code === "PRESIDENTE" ? "ADMISSIBILIDADE" : "JULGAMENTO",
    filed_by: filer?.id ?? null,
    lobby: 0,
  };
  const bill: BillRow = {
    id: ctx.id("imp", target.id),
    world_id: ctx.world.id,
    chamber,
    title: `Impeachment de ${target.name} (${role} ${place})`,
    summary: `Denúncia por crime de responsabilidade: ${reason}. ${m.office_code === "PRESIDENTE" ? "A Câmara decide se o processo segue (2/3 dos deputados) e o Senado julga (2/3 dos senadores)." : "Para afastar, são precisos 2/3 da Casa."}`,
    axis: "impeachment",
    direction: 1,
    author_party_id: filer?.party_id ?? opposition?.id ?? null,
    author_person_id: filer?.id ?? null,
    gov_position: m.office_code === "PRESIDENTE" ? -1 : 0,
    vote_on: addDays(ctx.date, rng.int(20, 35)),
    status: "TRAMITANDO",
    votes: { yes: 0, no: 0, abstain: 0, panels: [], impeachment: info },
    player_votes: {},
    fiscal_effect: 0,
  };
  ctx.save("bills", bill);
  ctx.world.stats = { ...ctx.world.stats, [`imp:${target.id}`]: ctx.tick };
  ctx.saveWorld();
  const house = chamberName(chamber, ctx.s);
  ctx.publish("IMPEACHMENT", {
    facts: { title: `${house} abre processo de impeachment contra ${target.name}`, body: `${filer ? `O pedido foi apresentado por ${filer.name}. ` : "O pedido foi apresentado pela oposição. "}Motivos: ${reason}. A votação no plenário está marcada para ${formatDatePt(bill.vote_on)}.` },
    personIds: [target.id],
    geography: ufOfGeo(m.geo),
  });
  if (target.kind === "PLAYER") {
    ctx.notify(target.id, "Processo de impeachment contra você", `${house} abriu o processo (${reason}). A votação é em ${formatDatePt(bill.vote_on)}. Na tela do governo, use Articular votos contra o impeachment para conversar com as bancadas e dar cargos a aliados.`, "/jogo/governo");
  }
  for (const p of ctx.t.persons.values()) {
    if (p.kind === "PLAYER" && p.status === "ACTIVE" && p.id !== target.id && chamberOf(p) === chamber) {
      ctx.notify(p.id, "Impeachment em pauta", `${bill.title}. Seu voto pode ser dado até ${formatDatePt(bill.vote_on)}, na tela do governo.`, "/jogo/governo#votacoes");
    }
  }
  return bill;
}

/** Partidos aliados de quem governa: a base do governo federal ou os partidos com cargos no secretariado. */
function allies(ctx: Ctx, target: PersonRow, m: MandateRow): Set<string> {
  const out = new Set<string>();
  if (m.office_code === "PRESIDENTE") for (const id of ctx.world.gov.base_party_ids) out.add(id);
  const cabinet = ctx.pstate(target.id)?.story?.cabinet;
  for (const post of cabinet?.posts ?? []) if (post.party_id) out.add(post.party_id);
  return out;
}

/** Quanto cada bancada apoia o impeachment (0 a 1). */
function impeachmentSupport(ctx: Ctx, target: PersonRow, m: MandateRow, info: ImpeachmentInfo): (party: PartyRow) => number {
  const st = ctx.pstate(target.id);
  const approval = executiveApproval(ctx, target, m);
  const friends = allies(ctx, target, m);
  const own = target.party_id ? ctx.t.parties.get(target.party_id) : undefined;
  const heat = (25 - approval) * 0.012 + Math.min(0.15, (st?.scandal ?? 0) * 0.003) + (underInvestigation(ctx, target.id) ? 0.12 : 0) + (st?.sentence ? 0.2 : 0) - info.lobby * 0.01;
  return (party) => {
    let s = 0.42 + heat;
    if (party.id === target.party_id) s -= 0.4;
    else if (friends.has(party.id)) s -= 0.22;
    else if (own && ideologyAffinity(party.ideology, own.ideology) > 0.85) s -= 0.1;
    return Math.max(0.03, Math.min(0.97, s));
  };
}

/** Apoio de uma bancada ao impeachment de alguém agora (0 a 1), para a tela e os testes. */
export function impeachmentSupportFor(ctx: Ctx, targetId: string, partyId: string): number | null {
  const target = ctx.person(targetId);
  const m = target ? executiveMandate(ctx, targetId) : null;
  const party = ctx.t.parties.get(partyId);
  if (!target || !m || !party) return null;
  const info = openImpeachmentOf(ctx, targetId)?.votes.impeachment ?? { target: targetId, name: target.name, office: m.office_code, geo: m.geo, reason: "", stage: "JULGAMENTO" as const, filed_by: null, lobby: 0 };
  return impeachmentSupport(ctx, target, m, info)(party);
}

/** Dia da votação do impeachment. */
function voteImpeachment(ctx: Ctx, bill: BillRow): void {
  const info = bill.votes.impeachment!;
  const target = ctx.person(info.target);
  const m = target ? executiveMandate(ctx, target.id) : null;
  if (!target || target.status !== "ACTIVE" || !m || m.office_code !== info.office || m.geo !== info.geo) {
    // quem era acusado já não está no cargo: o processo perde o objeto e é arquivado
    bill.status = "REJEITADO";
    ctx.save("bills", bill);
    return;
  }
  const step = info.stage === "ADMISSIBILIDADE" ? "Admissão do processo" : "Julgamento";
  const panel = runVote(ctx, bill, "IMPEACHMENT", step, impeachmentSupport(ctx, target, m, info));
  // quem é do partido de quem governa e vota pelo impeachment paga na direção do partido
  for (const [pid, v] of Object.entries(panel.players)) {
    const p = ctx.person(pid);
    const st = p ? ctx.pstate(pid) : undefined;
    if (!p || !st || !target.party_id || p.party_id !== target.party_id || v !== "SIM") continue;
    st.party_standing = Math.max(0, st.party_standing - 12);
    ctx.save("person_states", st);
  }
  bill.votes = { ...bill.votes, yes: panel.yes, no: panel.no, abstain: panel.abstain, panels: [...(bill.votes.panels ?? []), panel] };
  notifyMembers(ctx, panel, bill.title);
  const house = panel.house;
  if (!panel.approved) {
    bill.status = "REJEITADO";
    ctx.save("bills", bill);
    ctx.publish("IMPEACHMENT", {
      facts: { title: `${house} rejeita o impeachment de ${target.name}`, body: `${panel.yes} votos a favor, ${panel.no} contra e ${panel.abstain} abstenções; eram precisos ${panel.needed}. ${target.name} segue no cargo.` },
      personIds: [target.id],
      geography: ufOfGeo(m.geo),
    });
    if (target.kind === "PLAYER") {
      const st = ensureState(ctx, target);
      bumpApproval(target, st, ctx.date, 2, "Sobreviveu ao processo de impeachment");
      ctx.save("person_states", st);
      ctx.notify(target.id, "Você venceu o impeachment", `${house} rejeitou o processo: ${panel.yes} a favor e ${panel.no} contra (eram precisos ${panel.needed}). Você segue no cargo.`, "/jogo/governo#votacoes");
    }
    return;
  }
  if (info.stage === "ADMISSIBILIDADE") {
    // a Câmara autorizou: o Senado julga
    info.stage = "JULGAMENTO";
    bill.chamber = CHAMBER_SENADO;
    bill.vote_on = addDays(ctx.date, ctx.rng("impeachment-senado", bill.id).int(30, 60));
    bill.player_votes = {};
    ctx.save("bills", bill);
    ctx.publish("IMPEACHMENT", {
      facts: { title: `Câmara autoriza o processo de impeachment de ${target.name}`, body: `Foram ${panel.yes} votos a favor (eram precisos ${panel.needed}). O Senado julga em ${formatDatePt(bill.vote_on)}.` },
      personIds: [target.id],
      geography: ufOfGeo(m.geo),
    });
    if (target.kind === "PLAYER") ctx.notify(target.id, "A Câmara autorizou o processo", `Foram ${panel.yes} votos a favor. O Senado julga em ${formatDatePt(bill.vote_on)}: ainda dá para articular votos.`, "/jogo/governo");
    for (const p of ctx.t.persons.values()) {
      if (p.kind === "PLAYER" && p.status === "ACTIVE" && p.office_code === "SENADOR") ctx.notify(p.id, "Impeachment no Senado", `${bill.title}. O julgamento é em ${formatDatePt(bill.vote_on)}, na tela do governo.`, "/jogo/governo#votacoes");
    }
    return;
  }
  bill.status = "APROVADO";
  ctx.save("bills", bill);
  const successor = removeFromOffice(ctx, target, m);
  ctx.publish("IMPEACHMENT", {
    facts: { title: `${target.name} sofre impeachment e deixa o cargo`, body: `${house} aprovou o afastamento por ${panel.yes} votos (eram precisos ${panel.needed}). ${successor.name} assume até ${formatDatePt(m.end_on)}, e ${target.name} fica inelegível por 8 anos.` },
    personIds: [target.id, successor.id],
    geography: ufOfGeo(m.geo),
  });
  if (target.kind === "PLAYER") {
    ctx.notify(target.id, "Você sofreu impeachment", `${house} aprovou o afastamento por ${panel.yes} votos. Você deixa o cargo e fica inelegível por 8 anos; a carreira segue no partido.`, "/jogo/carreira");
  }
}

/** Afasta quem governa: o mandato acaba hoje, a pessoa fica inelegível por 8 anos e o vice assume. */
function removeFromOffice(ctx: Ctx, target: PersonRow, m: MandateRow): PersonRow {
  const end = m.end_on;
  m.status = "ENCERRADO";
  m.end_on = ctx.date;
  ctx.save("mandates", m);
  if (target.office_code === m.office_code && target.office_geo === m.geo) {
    target.office_code = null;
    target.office_geo = null;
    if (target.stage === "MANDATO") target.stage = target.party_id ? "QUADRO" : "CIDADAO";
  }
  ctx.save("persons", target);
  const st = ensureState(ctx, target);
  const until = addMonths(ctx.date, 96);
  if (!st.ineligible_until || st.ineligible_until < until) st.ineligible_until = until;
  ctx.save("person_states", st);
  // o vice: alguém do partido de quem saiu (ou do partido mais forte do estado), com o mandato até o fim
  const uf = m.geo === "BR" ? "DF" : ufOfGeo(m.geo);
  const partyId =
    (target.party_id && ctx.t.parties.get(target.party_id)?.status === "ATIVO" ? target.party_id : null) ??
    [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO").sort((a, b) => (b.territory[uf] ?? 0) - (a.territory[uf] ?? 0) || a.id.localeCompare(b.id))[0].id;
  const party = ctx.t.parties.get(partyId)!;
  const vice = spawnProceduralCadre(ctx, {
    partyId,
    uf,
    municipality: m.office_code === "PREFEITO" ? m.geo : undefined,
    ideology: party.ideology,
    roleLabel: `vice que assumiu o cargo de ${target.name}`,
    ageRange: [Math.max(OFFICES[m.office_code].minAge + 2, 38), 66],
    reputation: 45,
    tier: m.office_code === "PRESIDENTE" ? 1 : 2,
  });
  vice.office_code = m.office_code;
  vice.office_geo = m.geo;
  vice.stage = "MANDATO";
  ctx.save("persons", vice);
  ctx.save("mandates", { id: ctx.id("mvice", vice.id), world_id: ctx.world.id, person_id: vice.id, office_code: m.office_code, geo: m.geo, start_on: ctx.date, end_on: end, status: "ATIVO", election_id: m.election_id, approval: 40 });
  if (m.office_code === "PRESIDENTE") {
    ctx.world.gov.president_id = vice.id;
    for (const other of ctx.t.parties.values()) {
      const aff = ideologyAffinity(other.ideology, party.ideology);
      other.gov_alignment = other.id === party.id || aff > 0.82 ? 1 : aff < 0.62 ? -1 : 0;
      ctx.save("parties", other);
    }
    ctx.world.gov.base_party_ids = [...ctx.t.parties.values()].filter((x) => x.gov_alignment === 1).map((x) => x.id);
    ctx.world.gov.approval = 40;
    ctx.saveWorld();
  }
  ctx.publish("INAUGURATION", { facts: { name: vice.name, office: officeTitle(m.office_code, genderOf(vice)).toLowerCase(), geoName: geoName(m.geo, ctx.s), endDate: formatDatePt(end) }, personIds: [vice.id], geography: ufOfGeo(m.geo) });
  return vice;
}

/**
 * Mensal: a oposição pede o impeachment de quem governa com aprovação muito baixa, escândalos ou
 * investigação (só personagens fictícios e jogadores; nunca pessoas reais). Prefeitos: só nas
 * capitais e nas cidades em que algum jogador tem cargo (as outras câmaras o mundo não acompanha).
 */
export function monthlyImpeachments(ctx: Ctx): void {
  const playerGeos = new Set<string>();
  for (const p of ctx.t.persons.values()) if (p.kind === "PLAYER" && p.status === "ACTIVE" && p.office_geo) playerGeos.add(p.office_geo);
  for (const m of [...ctx.t.mandates.values()]) {
    if (m.status !== "ATIVO" || !EXECUTIVE.has(m.office_code)) continue;
    if (m.office_code === "PREFEITO" && !isCapital(m.geo) && !playerGeos.has(m.geo)) continue;
    const p = ctx.person(m.person_id);
    if (!p || isReal(p) || !impeachable(ctx, p)) continue;
    const approval = executiveApproval(ctx, p, m);
    const st = ctx.pstate(p.id);
    const heat = (approval < 20 ? (20 - approval) * 0.025 : 0) + ((st?.scandal ?? 0) >= 50 ? 0.1 : 0) + (st?.sentence ? 0.2 : 0);
    if (heat <= 0) continue;
    const hot = heat + (underInvestigation(ctx, p.id) ? 0.1 : 0);
    if (!ctx.rng("impeachment", p.id).chance(Math.min(0.45, hot))) continue;
    const reason = impeachmentGrounds(ctx, p, m);
    if (reason) fileImpeachment(ctx, p, m, reason, null);
  }
}

/* ---------------------------------------------------------------- ações do jogador */

/** Quem o jogador pode denunciar: o presidente (deputados e senadores), o governador do estado ou o prefeito da cidade. */
function impeachTarget(ctx: Ctx, p: PersonRow): { target: PersonRow; m: MandateRow } | null {
  const want: { office: OfficeCode; geo: string } | null =
    p.office_code === "DEP_FEDERAL" || p.office_code === "SENADOR"
      ? { office: "PRESIDENTE", geo: "BR" }
      : p.office_code === "DEP_ESTADUAL" && p.office_geo
        ? { office: "GOVERNADOR", geo: p.office_geo }
        : p.office_code === "VEREADOR" && p.office_geo
          ? { office: "PREFEITO", geo: p.office_geo }
          : null;
  if (!want) return null;
  for (const m of ctx.t.mandates.values()) {
    if (m.status !== "ATIVO" || m.office_code !== want.office || (want.geo !== "BR" && m.geo !== want.geo)) continue;
    const target = ctx.person(m.person_id);
    if (target && target.id !== p.id) return { target, m };
  }
  return null;
}

const pedirImpeachment: ActionDef = {
  id: "pedir_impeachment",
  label: "Pedir o impeachment de quem governa",
  description: "Denúncia por crime de responsabilidade contra o presidente (deputados e senadores), o governador do seu estado (deputados estaduais) ou o prefeito da sua cidade (vereadores). Com motivos (aprovação baixa, escândalos, investigação ou condenação), a Casa abre o processo e marca a votação; sem eles, o pedido é arquivado.",
  category: "MANDATO",
  energy: 20,
  available: (ctx, p) => {
    const t = impeachTarget(ctx, p);
    if (!t) return "Disponível para parlamentares, contra quem governa a sua esfera.";
    if (isReal(t.target)) return "Pessoas reais não são alvo de processos no jogo.";
    if (openImpeachmentOf(ctx, t.target.id)) return "Já há um processo de impeachment em andamento.";
    return impeachable(ctx, t.target) ? null : "Houve um processo há menos de um ano.";
  },
  run: ({ ctx, p, st }): ActionResult => {
    const t = impeachTarget(ctx, p);
    if (!t || !impeachable(ctx, t.target)) return { ok: false, message: "Não há como pedir o impeachment agora." };
    const sameParty = !!p.party_id && p.party_id === t.target.party_id;
    if (sameParty) st.party_standing = Math.max(0, st.party_standing - 15);
    const reason = impeachmentGrounds(ctx, t.target, t.m);
    if (!reason) {
      st.political_capital = Math.max(0, st.political_capital - 5);
      return { ok: true, message: `A presidência da Casa arquivou o pedido: faltam motivos (aprovação de ${Math.round(executiveApproval(ctx, t.target, t.m))}%, sem escândalo nem investigação).${sameParty ? " O seu partido não gostou nada." : ""}` };
    }
    const bill = fileImpeachment(ctx, t.target, t.m, reason, p);
    p.visibility = Math.min(100, p.visibility + 3);
    ctx.save("persons", p);
    return { ok: true, message: `Pedido aceito: ${chamberName(bill.chamber, ctx.s)} vota em ${formatDatePt(bill.vote_on)}. Dê o seu voto na tela do governo.${sameParty ? " Denunciar alguém do próprio partido custou prestígio na direção." : ""}` };
  },
};

const articular: ActionDef = {
  id: "articular_contra_impeachment",
  label: "Articular votos contra o impeachment",
  description: "Conversar com as bancadas, prometer apoio e ceder espaço no governo para tirar votos do impeachment. Rende menos a cada repetição; cargos no secretariado para partidos aliados também ajudam.",
  category: "MANDATO",
  energy: 15,
  available: (ctx, p) => (openImpeachmentOf(ctx, p.id) ? null : "Só quando há um processo de impeachment contra você."),
  run: ({ ctx, p, st, dr }): ActionResult => {
    const bill = openImpeachmentOf(ctx, p.id);
    if (!bill?.votes.impeachment) return { ok: false, message: "Não há processo contra você." };
    if (st.political_capital < 5) return { ok: false, message: "Falta capital político (5) para negociar." };
    const gain = Math.max(1, Math.round(6 * dr("articular_contra_impeachment")));
    const info = bill.votes.impeachment;
    info.lobby = Math.min(30, info.lobby + gain);
    st.political_capital -= 5;
    ctx.save("bills", bill);
    return { ok: true, message: `As conversas tiraram cerca de ${gain}% do apoio ao impeachment em cada bancada (no total, ${info.lobby}%). A votação é em ${formatDatePt(bill.vote_on)}.` };
  },
};

export const PLENARIO_ACTIONS: ActionDef[] = [pedirImpeachment, articular];

/** Projetos e processos que o jogador vota agora (os da Casa em que tem cadeira). */
export function votableBills(ctx: Ctx, p: PersonRow): BillRow[] {
  const chamber = chamberOf(p);
  if (!chamber) return [];
  return [...ctx.t.bills.values()].filter((b) => b.status === "TRAMITANDO" && b.chamber === chamber && b.votes.impeachment?.target !== p.id).sort((a, b) => a.vote_on.localeCompare(b.vote_on));
}

