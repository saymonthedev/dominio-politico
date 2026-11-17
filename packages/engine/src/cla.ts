import { joinParty, relKey } from "./affiliation";
import { ageAt, formatDatePt } from "./calendar";
import { checkEligibility, emptyCampaign, ensureRace, geoName } from "./elections";
import { familyOf, familyStateOf, looksFemale, roleLabel, type FamilyMember } from "./family";
import { worldPriceLevel } from "./finance";
import { hasMunicipalElections } from "./geo";
import { ensureHousing } from "./housing";
import { forgetClans, relativesOf, within } from "./kin";
import { distinctName } from "./names";
import { buildPerson, namesInUse } from "./npc";
import { OFFICES, officesForElection, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import { StoryCtx } from "./story/context";
import { endCareer } from "./story/life";
import { storyOf } from "./story/state";
import { ballotNumber } from "./ticket";
import type { CandidacyRow, ElectionRow, PersonRow, PersonStateRow } from "./types";

/**
 * Clã político (sugestão do jogador João Vitor). O jogador lança o cônjuge ou um filho(a) adulto(a)
 * como candidato(a) do mesmo partido: a pessoa entra no mundo com o nome e a idade da família, herda
 * cerca de 35% da reputação e do nome conhecido do jogador e soma votos na legenda. Vale a regra da
 * Constituição (art. 14, § 7º, em kin.ts): parente de prefeito, governador ou presidente não disputa
 * cargo no território de quem governa, salvo a reeleição. E quando a carreira acaba (morte,
 * aposentadoria) ou o jogador passa o bastão, ele continua jogando com um herdeiro: o filho(a) ou o
 * cônjuge, que herda parte da base, o partido, o dinheiro e os aliados.
 */

/** Parte do nome, da reputação e dos aliados que passa ao familiar e ao herdeiro. */
export const INHERIT = 0.35;

const LIVE = ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"];
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const PROFESSIONS = ["advogado(a)", "empresário(a)", "professor(a)", "médico(a)", "engenheiro(a)", "administrador(a)", "jornalista", "servidor(a) público(a)"];

type Pick = { ok: false; message: string } | { ok: true; message: string };

/** Familiares lançados na política (membro da família → pessoa no mundo). */
export function politicosOf(st: PersonStateRow): Record<string, string> {
  return st.story?.family?.politicos ?? {};
}

/** Cônjuge e filhos adultos que ainda não estão na política. */
export function familyCandidates(ctx: Ctx, me: PersonRow, st: PersonStateRow): FamilyMember[] {
  const year = Number(ctx.date.slice(0, 4));
  const launched = politicosOf(st);
  return familyOf(ctx, me, st).filter((m) => (m.role === "CONJUGE" || m.role === "FILHO") && year - m.born >= 18 && !launched[m.id]);
}

export function familyCandidateOptions(ctx: Ctx, me: PersonRow, st: PersonStateRow): Array<{ value: string; label: string }> {
  const year = Number(ctx.date.slice(0, 4));
  return familyCandidates(ctx, me, st).map((m) => ({ value: m.id, label: `${m.name} (${roleLabel(m).toLowerCase()}, ${year - m.born} anos)` }));
}

/** Eleições em que o familiar ainda pode entrar (filiação até o prazo da Justiça Eleitoral). */
function openElections(ctx: Ctx): ElectionRow[] {
  return [...ctx.t.elections.values()].filter((e) => e.status !== "ENCERRADA" && ctx.date <= e.calendar.filiationDeadline).sort((a, b) => a.year - b.year);
}

/** Cargos que o familiar pode disputar: na cidade do jogador (municipais) ou no estado dele (gerais). */
export function relativeOffices(ctx: Ctx, me: PersonRow): Array<{ e: ElectionRow; office: OfficeCode; geo: string }> {
  const out: Array<{ e: ElectionRow; office: OfficeCode; geo: string }> = [];
  for (const e of openElections(ctx).slice(0, 2)) {
    for (const office of officesForElection(e.kind)) {
      const scope = OFFICES[office].scope;
      if (scope === "MUNICIPIO" && !hasMunicipalElections(me.uf)) continue;
      out.push({ e, office, geo: scope === "BR" ? "BR" : scope === "UF" ? me.uf : me.municipality });
    }
  }
  return out;
}

export function relativeOfficeOptions(ctx: Ctx, me: PersonRow): Array<{ value: string; label: string }> {
  return relativeOffices(ctx, me).map(({ e, office, geo }) => ({ value: `${e.id}|${office}|${geo}`, label: `${OFFICES[office].name}${geo === "BR" ? "" : ` (${geoName(geo, ctx.s)})`} em ${e.year}` }));
}

/** O jogador ou alguém da família governa o território da disputa? (inelegibilidade reflexa) */
function familyBlock(ctx: Ctx, me: PersonRow, office: OfficeCode, geo: string): string | null {
  for (const r of [me, ...relativesOf(ctx, me.id)]) {
    if (r.status !== "ACTIVE" || !r.office_code || !r.office_geo || !["PREFEITO", "GOVERNADOR", "PRESIDENTE"].includes(r.office_code)) continue;
    if (!within(r.office_geo, geo)) continue;
    return `${r.id === me.id ? "Você é" : `${r.name} é`} ${OFFICES[r.office_code].name.toLowerCase()} ${r.office_geo === "BR" ? "do país" : `(${geoName(r.office_geo, ctx.s)})`}: parente de quem governa não disputa cargo nesse território (Constituição, art. 14, § 7º).`;
  }
  return null;
}

/** Por que não dá para lançar alguém da família agora (null = dá). */
export function launchBlocked(ctx: Ctx, me: PersonRow, st: PersonStateRow): string | null {
  if (!me.party_id) return "Filie-se a um partido: o familiar entra na mesma legenda.";
  if (!familyCandidates(ctx, me, st).length) return "Ninguém da família pode entrar na política agora: precisa ser o cônjuge ou um filho(a) com 18 anos ou mais, que ainda não foi lançado(a).";
  if (!relativeOffices(ctx, me).length) return "Nenhuma eleição aberta para novas filiações (o prazo da Justiça Eleitoral é 6 meses antes da votação).";
  return null;
}

/** Lançar o familiar: entra no mundo filiado ao partido, com pré-candidatura ao cargo escolhido. */
export function launchRelative(ctx: Ctx, me: PersonRow, st: PersonStateRow, memberId: string, officeKey: string): Pick {
  const blocked = launchBlocked(ctx, me, st);
  if (blocked) return { ok: false, message: blocked };
  const m = familyCandidates(ctx, me, st).find((x) => x.id === memberId);
  if (!m) return { ok: false, message: "Essa pessoa não pode entrar na política agora (idade ou já lançada)." };
  const target = relativeOffices(ctx, me).find((x) => `${x.e.id}|${x.office}|${x.geo}` === officeKey);
  if (!target) return { ok: false, message: "Escolha um cargo de uma eleição aberta na sua cidade ou no seu estado." };
  const { e, office, geo } = target;
  const age = ageAt(m.born, OFFICES[office].election === "MUNICIPAL" ? e.first_round : `${e.year + 1}-01-01`);
  if (age < OFFICES[office].minAge) return { ok: false, message: `${m.name} teria ${age} anos: a idade mínima para ${OFFICES[office].name} é ${OFFICES[office].minAge}.` };
  const reflex = familyBlock(ctx, me, office, geo);
  if (reflex) return { ok: false, message: `Inelegível pela família: ${reflex}` };
  if ([...ctx.t.candidacies.values()].some((c) => c.person_id === me.id && c.election_id === e.id && c.office_code === office && OFFICES[office].system === "MAJORITARIO" && LIVE.includes(c.status)))
    return { ok: false, message: "Você mesmo(a) disputa esse cargo: escolha outro para o familiar." };
  const party = ctx.t.parties.get(me.party_id!);
  if (!party || party.status !== "ATIVO") return { ok: false, message: "Seu partido não está ativo." };

  // a pessoa entra no mundo: o nome e a idade da família, parte do nome e da reputação do jogador
  const rng = ctx.rng("familiar", `${me.id}:${m.id}`);
  const used = namesInUse(ctx);
  const name = used.has(m.name) ? distinctName(m.name, used, rng) : m.name;
  used.add(name);
  const reach: Record<string, number> = {};
  for (const [uf, v] of Object.entries(st.reach)) if (v > 0) reach[uf] = Math.round(v * INHERIT * 10_000) / 10_000;
  const { person: fam, state: fst } = buildPerson({
    id: ctx.id("per", me.id, m.id),
    kind: "FICTIONAL_GENERATED",
    name,
    birthYear: m.born,
    uf: me.uf,
    municipality: me.municipality,
    profession: rng.pick(PROFESSIONS),
    origin: "procedural",
    partyId: null,
    ideology: { ...me.ideology },
    stage: "QUADRO",
    reputation: Math.round(clamp(20 + INHERIT * me.reputation)),
    visibility: Math.round(clamp(2 + INHERIT * me.visibility)),
    traits: { ambition: 0.6, loyalty: 0.9, riskTolerance: 0.3, competence: 0.5, charisma: 0.55 },
    money: Math.round(30_000 * worldPriceLevel(ctx.world)),
    reach,
    tier: 3,
    roleLabel: `${roleLabel(m).toLowerCase()} de ${me.name}`,
    filiationDate: ctx.date,
    domicileSince: "2000-01-01",
    createdTick: ctx.tick,
    worldId: ctx.world.id,
  });
  ctx.save("persons", fam);
  ctx.save("person_states", fst);
  joinParty(ctx, fam, party);
  fst.party_standing = Math.max(30, Math.round(st.party_standing * 0.6));
  ctx.save("person_states", fst);
  // a família sabe quem é quem (inelegibilidade reflexa, herdeiro)
  const f = familyStateOf(st, me, ctx.date);
  f.politicos = { ...(f.politicos ?? {}), [m.id]: fam.id };
  const s = storyOf(st, me, ctx.date);
  s.cla ??= { id: me.id };
  forgetClans(ctx);
  const elig = checkEligibility(ctx, fam, office, geo, e);
  if (!elig.ok) return { ok: true, message: `${fam.name} entrou no ${party.acronym}, mas ainda não pode disputar ${OFFICES[office].name.toLowerCase()} em ${e.year}: ${elig.reasons.join(" ")}` };
  const race = ensureRace(ctx, e, office, geo);
  const c: CandidacyRow = {
    id: ctx.id("cand", race.id, fam.id),
    world_id: ctx.world.id,
    election_id: e.id,
    race_id: race.id,
    person_id: fam.id,
    party_id: party.id,
    office_code: office,
    geo,
    status: "PRE",
    is_player: false,
    ballot_number: ballotNumber(ctx, party, office, race.id, fam.id),
    campaign: emptyCampaign(),
    votes: 0,
    vote_share: 0,
    note: `Pré-candidatura da família de ${me.name}`,
  };
  ctx.save("candidacies", c);
  fam.stage = "PRE_CANDIDATO";
  ctx.save("persons", fam);
  st.political_capital = clamp(st.political_capital - 5);
  ctx.save("person_states", st);
  // a família é aliada de primeira hora
  const id = relKey(me.id, fam.id);
  ctx.save("relationships", { id, world_id: ctx.world.id, a_id: me.id, b_id: fam.id, score: 80, interactions: 1, last_on: ctx.date });
  ctx.careerNews(me.id, `${fam.name} entra na política`, `${roleLabel(m)} de ${me.name}, ${fam.name} se filia ao ${party.acronym} e lança pré-candidatura a ${OFFICES[office].name.toLowerCase()}${geo === "BR" ? "" : ` em ${geoName(geo, ctx.s)}`} em ${e.year}.`);
  return {
    ok: true,
    message: `${fam.name} se filiou ao ${party.acronym} e lançou pré-candidatura a ${OFFICES[office].name.toLowerCase()}${geo === "BR" ? "" : ` (${geoName(geo, ctx.s)})`} em ${e.year}. Herdou cerca de ${Math.round(INHERIT * 100)}% do seu nome e da sua reputação; a convenção do partido decide a candidatura. Para ajudar na campanha, declare apoio a ${fam.name.split(" ")[0]} na tela da carreira.`,
  };
}

// ---------------------------------------------------------------------------
// Herdeiro: continuar jogando com o filho(a) ou o cônjuge
// ---------------------------------------------------------------------------

export interface HeirChoice {
  member: FamilyMember;
  /** a pessoa já está na política (familiar lançado), com o cargo e a candidatura que tiver */
  person?: PersonRow;
}

/** Cônjuge e filhos adultos que podem continuar a carreira (vivos; quem está na política segue com o que tem). */
export function heirChoices(ctx: Ctx, titular: PersonRow, st: PersonStateRow): HeirChoice[] {
  const year = Number(ctx.date.slice(0, 4));
  const pol = politicosOf(st);
  const out: HeirChoice[] = [];
  for (const m of familyOf(ctx, titular, st)) {
    if (m.role !== "CONJUGE" && m.role !== "FILHO") continue;
    if (year - m.born < ctx.s.ruleset.minCharacterAge || year - m.born > 80) continue;
    const pid = pol[m.id];
    const person = pid ? ctx.person(pid) : undefined;
    if (pid && (!person || person.status !== "ACTIVE")) continue; // saiu da vida pública
    out.push({ member: m, person });
  }
  return out;
}

export function heirOptions(ctx: Ctx, titular: PersonRow, st: PersonStateRow): Array<{ value: string; label: string }> {
  const year = Number(ctx.date.slice(0, 4));
  return heirChoices(ctx, titular, st).map(({ member: m, person }) => ({
    value: m.id,
    label: `${person?.name ?? m.name} (${roleLabel(m).toLowerCase()}, ${year - m.born} anos)${person?.office_code ? ` · ${OFFICES[person.office_code].name.toLowerCase()}` : person ? " · já na política" : ""}`,
  }));
}

/** A família do herdeiro: a do titular (pais, cônjuge, filhos), não uma sorteada. */
function heirOrigin(ctx: Ctx, titular: PersonRow, st: PersonStateRow, heir: FamilyMember, dead: boolean): { origin: FamilyMember[]; gone: string[] } {
  const fam = familyOf(ctx, titular, st);
  const tFemale = looksFemale(titular.name.split(" ")[0] ?? "");
  const me: FamilyMember = { id: "titular", role: "PAI", name: titular.name, born: titular.birth_year, bond: 85, female: tFemale };
  const origin: FamilyMember[] = [];
  if (heir.role === "FILHO") {
    origin.push({ ...me, role: tFemale ? "MAE" : "PAI" });
    const spouse = fam.find((m) => m.role === "CONJUGE");
    if (spouse) origin.push({ ...spouse, id: "outro_genitor", role: spouse.female ? "MAE" : "PAI" });
  } else {
    origin.push({ ...me, role: "CONJUGE" });
    for (const k of fam.filter((m) => m.role === "FILHO")) origin.push({ ...k });
  }
  return { origin, gone: dead ? ["titular"] : [] };
}

/**
 * Cria o herdeiro (jogador) a partir de alguém da família do titular. Se o titular ainda está na
 * vida pública, a carreira dele acaba aqui (passa o bastão). Quem já está na política (familiar
 * lançado) vira o personagem do jogador com o cargo, o partido e a candidatura que tiver.
 */
export function createHeir(ctx: Ctx, input: { userId: string; titularId: string; memberId: string }): { ok: boolean; error?: string; person?: PersonRow } {
  const titular = ctx.person(input.titularId);
  const tst = ctx.pstate(input.titularId);
  if (!titular || !tst || titular.kind !== "PLAYER" || titular.user_id !== input.userId) return { ok: false, error: "Personagem não encontrado." };
  const pick = heirChoices(ctx, titular, tst).find((x) => x.member.id === input.memberId);
  if (!pick) return { ok: false, error: "Essa pessoa não pode continuar a carreira (idade ou saiu da vida pública)." };
  const other = [...ctx.t.persons.values()].find((p) => p.user_id === input.userId && p.status === "ACTIVE" && p.id !== titular.id);
  if (other) return { ok: false, error: "Você já tem um personagem neste mundo." };
  const ts = storyOf(tst, titular, ctx.date);
  const alive = titular.status === "ACTIVE";
  const partyId = alive ? titular.party_id : ts.ended?.party ?? null;
  const name = pick.person?.name ?? pick.member.name;
  if (alive) endCareer(new StoryCtx(ctx, titular, tst, ctx.rng("bastao", titular.id)), "APOSENTADORIA", `passou o bastão para ${name}`);
  const dead = ts.ended?.cause === "MORTE";

  let heir: PersonRow;
  let hst: PersonStateRow;
  if (pick.person) {
    // o familiar que já está na política vira o personagem do jogador
    heir = pick.person;
    hst = ctx.pstate(heir.id)!;
    heir.kind = "PLAYER";
    heir.user_id = input.userId;
    heir.role_label = null;
    hst.user_id = input.userId;
    hst.story = null;
    hst.energy = 100;
    for (const c of ctx.t.candidacies.values()) {
      if (c.person_id !== heir.id || !LIVE.includes(c.status)) continue;
      c.is_player = true;
      ctx.save("candidacies", c);
    }
  } else {
    const used = namesInUse(ctx);
    const finalName = used.has(name) ? distinctName(name, used, ctx.rng("herdeiro", titular.id)) : name;
    used.add(finalName);
    const reach: Record<string, number> = {};
    for (const [uf, v] of Object.entries(tst.reach)) if (v > 0) reach[uf] = Math.round(v * INHERIT * 10_000) / 10_000;
    const built = buildPerson({
      id: ctx.id("per_p", input.userId, pick.member.id),
      kind: "PLAYER",
      name: finalName,
      birthYear: pick.member.born,
      uf: titular.uf,
      municipality: titular.municipality,
      profession: titular.profession,
      origin: titular.origin,
      partyId: null,
      ideology: { ...titular.ideology },
      stage: "CIDADAO",
      reputation: Math.round(clamp(20 + INHERIT * titular.reputation)),
      visibility: Math.round(clamp(2 + INHERIT * titular.visibility)),
      traits: { ...tst.traits },
      money: 0,
      reach,
      tier: 3,
      userId: input.userId,
      domicileSince: tst.domicile_since,
      createdTick: ctx.tick,
      worldId: ctx.world.id,
    });
    heir = built.person;
    hst = built.state;
    hst.interests = [...tst.interests];
    hst.income_last_year = 0;
    ctx.save("persons", heir);
    ctx.save("person_states", hst);
    const party = partyId ? ctx.t.parties.get(partyId) : undefined;
    if (party && party.status === "ATIVO") joinParty(ctx, heir, party);
  }
  // a herança: dinheiro (ITCMD de 4% na morte; em vida, uma doação de 30%), nome, capital e aliados
  const estate = Math.max(0, tst.money - tst.debt);
  const given = Math.round(dead ? estate * 0.96 : estate * 0.3);
  hst.money += given;
  tst.money = dead ? 0 : tst.money - given;
  hst.political_capital = Math.max(hst.political_capital, Math.round(tst.political_capital * INHERIT));
  if (heir.party_id && heir.party_id === partyId) hst.party_standing = Math.max(hst.party_standing, Math.round(tst.party_standing * 0.5), 25);
  for (const [uf, v] of Object.entries(tst.reach)) hst.reach[uf] = Math.max(hst.reach[uf] ?? 0, Math.round(v * INHERIT * 10_000) / 10_000);
  heir.reputation = Math.max(heir.reputation, Math.round(clamp(20 + INHERIT * titular.reputation)));
  const allies = [...ctx.t.relationships.values()].filter((r) => r.a_id === titular.id && r.score >= 20 && r.b_id !== heir.id).sort((a, b) => b.score - a.score).slice(0, 40);
  for (const r of allies) {
    const id = relKey(heir.id, r.b_id);
    const prev = ctx.t.relationships.get(id);
    ctx.save("relationships", { id, world_id: ctx.world.id, a_id: heir.id, b_id: r.b_id, score: Math.max(prev?.score ?? 0, Math.round(r.score * 0.5)), interactions: (prev?.interactions ?? 0) + 1, last_on: ctx.date });
  }
  // a vida do herdeiro: a família do titular, o clã e a casa
  const hs = storyOf(hst, heir, ctx.date);
  const { origin, gone } = heirOrigin(ctx, titular, tst, pick.member, dead);
  hs.family = { bonds: {}, added: [], gone, origin };
  hs.cla = { id: ts.cla?.id ?? titular.id, de: titular.id, nome_de: titular.name };
  hs.flags.herdeiro = true;
  ensureHousing(ctx.s, heir, hst, ctx.date);
  ts.ended = { ...(ts.ended ?? { on: ctx.date, age: ageAt(titular.birth_year, ctx.date), cause: "APOSENTADORIA", detail: "" }), heir: heir.id };
  // o titular passa a ser família do herdeiro (o clã segue)
  const tf = familyStateOf(tst, titular, ctx.date);
  tf.politicos = { ...(tf.politicos ?? {}), [pick.member.id]: heir.id };
  forgetClans(ctx);
  ctx.save("persons", heir);
  ctx.save("person_states", hst);
  ctx.save("person_states", tst);
  ctx.save("persons", titular);
  const role = roleLabel(pick.member).toLowerCase();
  ctx.careerNews(heir.id, `${heir.name} assume o legado de ${titular.name}`, `${roleLabel(pick.member)} de ${titular.name}, ${heir.name} herda o nome, os aliados e ${given ? `R$ ${given.toLocaleString("pt-BR")}` : "o que a família tinha"} e segue a carreira política${heir.party_id ? ` no ${ctx.t.parties.get(heir.party_id)?.acronym ?? "partido"}` : ""}.`);
  ctx.notify(heir.id, "O legado continua", `Você agora joga com ${heir.name}, ${role} de ${titular.name}. Herdou cerca de ${Math.round(INHERIT * 100)}% do nome e da reputação, os aliados mais próximos${given ? ` e R$ ${given.toLocaleString("pt-BR")}` : ""}.`, "/jogo");
  ctx.emit("CHARACTER_CREATED", { actors: [heir.id], geography: heir.uf, payload: { municipality: heir.municipality, heir_of: titular.id } });
  return { ok: true, person: heir };
}

/** Passar o bastão (ação do jogador vivo): a carreira acaba e o herdeiro assume na hora. */
export function passBaton(ctx: Ctx, me: PersonRow, memberId: string): Pick {
  if (!me.user_id) return { ok: false, message: "Personagem sem conta." };
  const r = createHeir(ctx, { userId: me.user_id, titularId: me.id, memberId });
  if (!r.ok || !r.person) return { ok: false, message: r.error ?? "Não foi possível passar o bastão." };
  return { ok: true, message: `Você passou o bastão: a partir de agora você joga com ${r.person.name}. A carreira de ${me.name} foi encerrada em ${formatDatePt(ctx.date)}.` };
}
