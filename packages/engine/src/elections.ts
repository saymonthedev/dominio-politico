import { addDays, ageAt, diffDays, formatDatePt, year, type ISODate } from "./calendar";
import { canonicalGeo, type CityBase, cityCouncilSeats, getUF, hasMunicipalElections, isCapital, isMunicipality, stateSeats, ufOfMunicipality, UFS, UF_BY_CODE } from "./geo";
import { activeCities, cityName, snapshotTerritory } from "./cities";
import { ideologyAffinity } from "./ideology";
import { isReal } from "./news/policy";
import { POLL_INSTITUTES } from "./news/outlets";
import { spawnProceduralCadre } from "./npc";
import { isPlayerLed } from "./partyfounding";
import { rngFor, Rng } from "./rng";
import { eraRules, inaugurationDate, OFFICES, officesForElection, senateSeatsForYear, termEnd, type OfficeCode } from "./ruleset";
import type { Ctx, WorldState } from "./state";
import { ufShares, type Contender } from "./support";
import type { CampaignState, CandidacyRow, CandidateResult, DebateRow, ElectionRow, PartyListResult, PartyRow, PersonRow, RaceRow, VoterSegmentRow } from "./types";

export const emptyCampaign = (): CampaignState => ({
  budget: 0, spent: 0, fefc: 0, donations: 0, volunteers: 0, team: {}, momentum: 0, debate_score: 0, proposals: [], rumor_damage: 0,
});

export function geoName(geo: string, s?: { cities?: Map<string, CityBase> }): string {
  if (geo === "BR") return "todo o Brasil";
  const g = canonicalGeo(geo);
  if (isMunicipality(g)) {
    const name = s ? cityName(s, g) : null;
    const uf = ufOfMunicipality(g);
    return name ? `${name} (${uf})` : UF_BY_CODE[uf]?.capital ?? g;
  }
  return UF_BY_CODE[geo]?.name ?? geo;
}

export function ufOfGeo(geo: string): string {
  const g = canonicalGeo(geo);
  return isMunicipality(g) ? ufOfMunicipality(g) : g;
}

function raceElectorate(ctx: Ctx, geo: string): number {
  if (geo === "BR") return UFS.reduce((s, u) => s + u.electorate, 0);
  const g = canonicalGeo(geo);
  if (isMunicipality(g)) {
    const uf = getUF(ufOfMunicipality(g));
    return ctx.s.cities?.get(g)?.electorate || (isCapital(g) ? uf.capitalElectorate : Math.round(uf.electorate / 200));
  }
  return getUF(geo).electorate;
}

function raceSeats(ctx: Ctx, office: OfficeCode, geo: string, y: number): number {
  switch (office) {
    case "SENADOR":
      return senateSeatsForYear(y);
    case "DEP_FEDERAL":
      return getUF(geo).fedSeats;
    case "DEP_ESTADUAL":
      return stateSeats(geo);
    case "VEREADOR":
      return cityCouncilSeats(raceElectorate(ctx, geo));
    default:
      return 1;
  }
}

/** Cria uma disputa se ainda não existir (ex.: cidade de um jogador que chegou depois). */
export function ensureRace(ctx: Ctx, e: ElectionRow, office: OfficeCode, geo: string): RaceRow {
  const id = `${e.id}:${office}:${geo}`;
  const existing = ctx.t.races.get(id);
  if (existing) return existing;
  const race: RaceRow = {
    id,
    world_id: ctx.world.id,
    election_id: e.id,
    office_code: office,
    geo,
    seats: raceSeats(ctx, office, geo, e.year),
    electorate: raceElectorate(ctx, geo),
    status: "ABERTA",
    results: {},
    latest_poll: null,
  };
  ctx.save("races", race);
  return race;
}

/**
 * Cria as disputas de uma eleição (início da pré-campanha). Nas municipais,
 * só capitais e cidades com jogadores têm disputa completa; as demais têm o
 * resultado calculado em cities.ts.
 */
export function createRaces(ctx: Ctx, e: ElectionRow): void {
  for (const office of officesForElection(e.kind)) {
    const rule = OFFICES[office];
    const geos = rule.scope === "BR" ? ["BR"] : rule.scope === "UF" ? UFS.map((u) => u.code) : activeCities(ctx);
    for (const geo of geos) ensureRace(ctx, e, office, geo);
  }
}

// ---------------------------------------------------------------------------
// Elegibilidade
// ---------------------------------------------------------------------------

export interface Eligibility {
  ok: boolean;
  reasons: string[];
}

export function consecutiveTerms(ctx: Ctx, personId: string, office: OfficeCode, geo: string): number {
  const ms = [...ctx.t.mandates.values()]
    .filter((m) => m.person_id === personId && m.office_code === office && m.geo === geo && m.status !== "FUTURO")
    .sort((a, b) => (a.start_on < b.start_on ? 1 : -1));
  if (!ms.length) return 0;
  const futureOrActive = [...ctx.t.mandates.values()].filter((m) => m.person_id === personId && m.office_code === office && m.geo === geo && m.status === "FUTURO");
  let chain = futureOrActive.length ? 1 : 0;
  let cursor = futureOrActive[0]?.start_on ?? null;
  for (const m of ms) {
    if (cursor === null) {
      if (m.status !== "ATIVO") break;
      chain = 1;
      cursor = m.start_on;
      continue;
    }
    if (Math.abs(diffDays(m.end_on, cursor)) <= 10) {
      chain++;
      cursor = m.start_on;
    } else break;
  }
  return chain;
}

export function checkEligibility(ctx: Ctx, person: PersonRow, office: OfficeCode, geo: string, e: ElectionRow): Eligibility {
  const reasons: string[] = [];
  const rule = OFFICES[office];
  const era = eraRules(e.year);
  const st = ctx.pstate(person.id);
  const posse = inaugurationDate(office, e.year);
  const age = ageAt(person.birth_year, office === "VEREADOR" ? e.first_round : posse);
  if (age < rule.minAge) reasons.push(`Idade mínima para ${rule.name}: ${rule.minAge} anos.`);
  if (person.status !== "ACTIVE") reasons.push("Pessoa fora da vida pública.");
  if (!person.party_id) reasons.push("É preciso estar filiado(a) a um partido.");
  if (st?.filiation_date && st.filiation_date > e.calendar.filiationDeadline)
    reasons.push(`Filiação precisa ter ocorrido até ${formatDatePt(e.calendar.filiationDeadline)} (${era.filiationMonths} meses antes).`);
  if (st && !st.filiation_date && person.party_id === null) reasons.push("Sem filiação partidária.");
  if (st && st.domicile_since > addDays(e.first_round, -era.domicileMonths * 30)) reasons.push(`Domicílio eleitoral exigido há ${era.domicileMonths} meses.`);
  if (st?.ineligible_until && st.ineligible_until > e.first_round) reasons.push(`Inelegível até ${formatDatePt(st.ineligible_until)}.`);
  if (ufOfGeo(geo) !== person.uf && geo !== "BR") reasons.push("Domicílio eleitoral em outra UF.");
  if (rule.consecutiveLimit !== null && consecutiveTerms(ctx, person.id, office, geo) > rule.consecutiveLimit) reasons.push("Limite de mandatos consecutivos atingido.");
  if (office === "PREFEITO" || office === "VEREADOR") {
    if (!hasMunicipalElections(person.uf)) reasons.push("O Distrito Federal não tem eleições municipais.");
    else if (person.kind === "PLAYER" && canonicalGeo(person.municipality) !== canonicalGeo(geo)) reasons.push("Domicílio eleitoral em outro município.");
  }
  return { ok: reasons.length === 0, reasons };
}

// ---------------------------------------------------------------------------
// Apoio, contendores
// ---------------------------------------------------------------------------

function latentNoise(ctx: Ctx, candidacyId: string, uf: string): number {
  const base = rngFor(ctx.world.seed, "latent", 0, candidacyId).normal(0, 0.3);
  const local = rngFor(ctx.world.seed, "latent-uf", 0, `${candidacyId}:${uf}`).normal(0, 0.15);
  return base + local;
}

export function contenderFor(ctx: Ctx, c: CandidacyRow, uf: string): Contender {
  const p = ctx.person(c.person_id)!;
  const st = ctx.pstate(p.id);
  const party = ctx.t.parties.get(c.party_id);
  const officeIncumbent = p.office_code === c.office_code && (p.office_geo === c.geo || c.geo === "BR");
  return {
    id: c.id,
    ideology: p.ideology,
    reputation: p.reputation,
    recognition: Math.min(1, (st?.reach[uf] ?? 0) + (c.office_code === "PRESIDENTE" ? p.visibility / 500 : 0)),
    partyStrength: party ? party.territory[uf] ?? 0 : 0,
    govAlignment: party?.gov_alignment ?? 0,
    incumbent: officeIncumbent,
    momentum: c.campaign.momentum + c.campaign.debate_score,
    scandal: (st?.scandal ?? 0) + c.campaign.rumor_damage,
    noise: latentNoise(ctx, c.id, uf),
    seg: c.campaign.seg,
  };
}

/**
 * Força de um jogador na lista do partido (cargos proporcionais): nome
 * conhecido, reputação, fôlego, gastos, apoio nos grupos de eleitores e
 * gente na rua (voluntários e cabos eleitorais).
 */
export function playerListStrength(ctx: Ctx, race: RaceRow, c: CandidacyRow, noise = 0): number {
  const uf = ufOfGeo(race.geo);
  const p = ctx.person(c.person_id)!;
  const st = ctx.pstate(p.id)!;
  const spentFactor = Math.min(1, c.campaign.spent / Math.max(1, ctx.s.ruleset.spendingCapPerVoter[race.office_code] * race.electorate * 0.3));
  const segs = segmentsOf(ctx, uf);
  const totalW = segs.reduce((s, sg) => s + sg.weight, 0) || 1;
  const segBonus = segs.reduce((s, sg) => s + (c.campaign.seg?.[sg.segment] ?? 0) * sg.weight, 0) / totalW;
  const street = c.campaign.volunteers + (c.campaign.canvassers ?? 0) * 3;
  const ground = Math.min(0.6, street / Math.max(150, race.electorate / 1500));
  return Math.exp(
    -1.25 +
      3 * (st.reach[uf] ?? 0) +
      0.8 * ((p.reputation - 50) / 50) +
      0.6 * c.campaign.momentum +
      spentFactor +
      1.4 * segBonus +
      0.5 * ground -
      (st.scandal / 100) * 1.5 -
      c.campaign.rumor_damage / 60 +
      noise,
  );
}

function segmentsOf(ctx: Ctx, uf: string): VoterSegmentRow[] {
  return [...ctx.t.voter_segments.values()].filter((s) => s.uf === uf);
}

export interface RaceTally {
  votes: Map<string, number>;
  turnout: number;
  invalid: number;
  valid: number;
}

/** Apura uma disputa majoritária (votos absolutos). */
export function tallyMajoritarian(ctx: Ctx, race: RaceRow, cands: CandidacyRow[]): RaceTally {
  const votes = new Map<string, number>(cands.map((c) => [c.id, 0]));
  let turnout = 0;
  let invalid = 0;
  const ufs = race.geo === "BR" ? UFS.map((u) => u.code) : [ufOfGeo(race.geo)];
  for (const uf of ufs) {
    const contenders = cands.map((c) => contenderFor(ctx, c, uf));
    const res = ufShares(segmentsOf(ctx, uf), contenders, ctx.world.gov.approval, ctx.s.economy.gdp_growth / 4 - (ctx.s.economy.unemployment - 7) / 10);
    const electorate = race.geo === "BR" ? getUF(uf).electorate : race.electorate;
    const t = electorate * res.turnout;
    const inv = t * res.invalidShare;
    turnout += t;
    invalid += inv;
    for (const [id, share] of res.shares) votes.set(id, (votes.get(id) ?? 0) + (t - inv) * share);
  }
  for (const [id, v] of votes) votes.set(id, Math.round(v));
  const valid = [...votes.values()].reduce((a, b) => a + b, 0);
  return { votes, turnout: Math.round(turnout), invalid: Math.round(invalid), valid };
}

// ---------------------------------------------------------------------------
// Pré-campanha e convenções
// ---------------------------------------------------------------------------

function nationalStrength(p: PartyRow): number {
  let s = 0;
  let t = 0;
  for (const u of UFS) {
    s += (p.territory[u.code] ?? 0) * u.electorate;
    t += u.electorate;
  }
  return s / t;
}

function partyStrengthIn(p: PartyRow, geo: string): number {
  return geo === "BR" ? nationalStrength(p) : p.territory[ufOfGeo(geo)] ?? 0;
}

function candidateScore(ctx: Ctx, p: PersonRow, office: OfficeCode, geo: string, rng: Rng): number {
  const st = ctx.pstate(p.id);
  const uf = ufOfGeo(geo);
  const recog = geo === "BR" ? p.visibility / 100 : st?.reach[uf] ?? 0;
  const rank = OFFICES[office].rank;
  const currentRank = p.office_code ? OFFICES[p.office_code].rank : 0;
  const stepUp = rank > currentRank ? 8 : rank === currentRank ? 12 : -25;
  const tierBonus = p.tier === 1 ? 20 : p.tier === 2 ? 8 : 0;
  return p.reputation * 0.4 + recog * 45 + tierBonus + stepUp + (st?.traits.ambition ?? 0.5) * 15 + (st?.party_standing ?? 30) * 0.15 + rng.normal(0, 6);
}

const MAJ_CANDIDATES: Partial<Record<OfficeCode, [number, number]>> = {
  PRESIDENTE: [4, 8],
  GOVERNADOR: [3, 6],
  SENADOR: [3, 6],
  PREFEITO: [3, 6],
};

/** Convenções: partidos escolhem candidatos; o jogador disputa a indicação interna. */
export function runConventions(ctx: Ctx, e: ElectionRow): void {
  const races = [...ctx.t.races.values()].filter((r) => r.election_id === e.id);
  const taken = new Set<string>();
  // Jogadores com pré-candidatura registrada
  const pre = [...ctx.t.candidacies.values()].filter((c) => c.election_id === e.id && c.status === "PRE");
  const preByRace = new Map<string, CandidacyRow[]>();
  for (const c of pre) preByRace.set(c.race_id, [...(preByRace.get(c.race_id) ?? []), c]);

  // Ordena: cargos mais altos primeiro (quem disputa Presidência não disputa governo)
  races.sort((a, b) => OFFICES[b.office_code].rank - OFFICES[a.office_code].rank);
  const parties = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO");
  const fefcTotal = fefcTotalFor(ctx, e);
  const camaraTotal = parties.reduce((s, p) => s + (p.seats.camara ?? 0), 0) || 1;

  for (const race of races) {
    const rule = OFFICES[race.office_code];
    const rng = ctx.rng("convention", race.id);
    if (rule.system === "PROPORCIONAL") {
      for (const c of preByRace.get(race.id) ?? []) {
        const p = ctx.person(c.person_id)!;
        const st = ctx.pstate(p.id)!;
        const party = ctx.t.parties.get(c.party_id);
        // partido presidido por jogador: quem decide a chapa é a presidência
        const led = !!party && isPlayerLed(ctx, party);
        const elig = checkEligibility(ctx, p, race.office_code, race.geo, e);
        const approved = elig.ok && (led || st.party_standing >= 20);
        c.status = approved ? "HOMOLOGADA" : "INDEFERIDA";
        c.note = approved ? (led ? "Chapa definida pela presidência do partido" : "Indicação aprovada em convenção") : elig.ok ? "A convenção não incluiu seu nome na chapa (pouco espaço no partido)." : elig.reasons.join(" ");
        if (approved) {
          p.stage = "CANDIDATO";
          ctx.save("persons", p);
          // no partido de jogador, o fundo eleitoral é repartido pela presidência (partycampaign.ts)
          if (!led) allocateFefc(ctx, c, fefcTotal, camaraTotal, 0.002);
        }
        ctx.save("candidacies", c);
        ctx.notify(p.id, approved ? "Candidatura homologada" : "Candidatura não homologada", c.note ?? "", "/jogo/campanha");
        taken.add(p.id);
      }
      continue;
    }
    const [minC, maxC] = MAJ_CANDIDATES[race.office_code] ?? [2, 4];
    const target = rng.int(minC, maxC) * (race.office_code === "SENADOR" ? Math.max(1, race.seats) : 1);
    // partidos de jogador só disputam onde a presidência indicou alguém (entram abaixo, pelas pré-candidaturas)
    const ranked = parties
      .filter((p) => !isPlayerLed(ctx, p))
      .map((p) => ({ p, s: partyStrengthIn(p, race.geo) * (0.6 + p.reputation / 125) + rng.range(0, 0.08) }))
      .sort((a, b) => b.s - a.s);
    const running: PartyRow[] = [];
    for (const { p } of ranked) {
      if (running.length >= target) break;
      if (running.some((r) => r.federation && r.federation === p.federation) && eraRules(e.year).federations) continue;
      running.push(p);
    }
    // Partido de um jogador pré-candidato sempre decide internamente
    for (const c of preByRace.get(race.id) ?? []) {
      const party = ctx.t.parties.get(c.party_id);
      if (party && !running.includes(party)) running.push(party);
    }
    let ballot = 0;
    // cidades do interior: candidatos locais (as capitais usam quadros da UF)
    const localRace = isMunicipality(race.geo) && !isCapital(race.geo);
    for (const party of running) {
      ballot++;
      const uf = ufOfGeo(race.geo);
      const led = isPlayerLed(ctx, party);
      const pool = [...ctx.t.persons.values()].filter(
        (p) =>
          !led &&
          p.party_id === party.id &&
          p.kind !== "PLAYER" &&
          !taken.has(p.id) &&
          (race.geo === "BR" ? p.tier <= 2 : localRace ? canonicalGeo(p.municipality) === race.geo : p.uf === uf) &&
          checkEligibility(ctx, p, race.office_code, race.geo, e).ok,
      );
      const scored = pool.map((p) => ({ p, s: candidateScore(ctx, p, race.office_code, race.geo, rng) }));
      const players = (preByRace.get(race.id) ?? []).filter((c) => c.party_id === party.id);
      for (const pc of players) {
        const p = ctx.person(pc.person_id)!;
        const elig = checkEligibility(ctx, p, race.office_code, race.geo, e);
        if (!elig.ok) {
          pc.status = "INDEFERIDA";
          pc.note = elig.reasons.join(" ");
          ctx.save("candidacies", pc);
          ctx.notify(p.id, "Pré-candidatura barrada", pc.note, "/jogo/campanha");
          continue;
        }
        // no partido de jogador: a pré-candidatura do presidente vem primeiro, depois outros jogadores, depois as indicações
        const priority = led ? (p.id === party.president_id ? 1000 : p.kind === "PLAYER" ? 500 : 0) : 0;
        scored.push({ p, s: priority + candidateScore(ctx, p, race.office_code, race.geo, rng) + (ctx.pstate(p.id)?.party_standing ?? 0) * 0.25 });
      }
      scored.sort((a, b) => b.s - a.s);
      let chosen = scored[0]?.p;
      if (!chosen) {
        if (led) continue;
        if (race.office_code === "PRESIDENTE" && party.seats.camara === undefined) continue;
        chosen = spawnProceduralCadre(ctx, {
          partyId: party.id,
          uf: race.geo === "BR" ? "DF" : uf,
          municipality: isMunicipality(race.geo) ? race.geo : "",
          ideology: party.ideology,
          roleLabel: `quadro do ${party.acronym}`,
          ageRange: [Math.max(OFFICES[race.office_code].minAge + 1, 36), 62],
          reputation: 45,
          tier: race.office_code === "PRESIDENTE" ? 1 : 2,
        });
        const st = ctx.pstate(chosen.id)!;
        st.reach[uf] = 0.25;
        st.filiation_date = "2000-01-01";
        ctx.save("person_states", st);
        ctx.publish("NEW_FACE", { facts: { party: party.acronym, name: chosen.name, uf: getUF(race.geo === "BR" ? "DF" : uf).name, age: ageAt(chosen.birth_year, ctx.date), profession: chosen.profession }, personIds: [chosen.id], geography: uf });
      }
      taken.add(chosen.id);
      for (const pc of players) {
        if (pc.person_id === chosen.id) continue;
        if (pc.status === "PRE") {
          pc.status = "DESISTENTE";
          pc.note = `A convenção do ${party.acronym} escolheu ${chosen.name}.`;
          ctx.save("candidacies", pc);
          const pl = ctx.person(pc.person_id)!;
          pl.stage = "QUADRO";
          ctx.save("persons", pl);
          ctx.notify(pc.person_id, "Você perdeu a disputa interna", pc.note, "/jogo/carreira");
        }
      }
      const existing = players.find((pc) => pc.person_id === chosen!.id);
      const cand: CandidacyRow = existing ?? {
        id: ctx.id("cand", race.id, chosen.id),
        world_id: ctx.world.id,
        election_id: e.id,
        race_id: race.id,
        person_id: chosen.id,
        party_id: party.id,
        office_code: race.office_code,
        geo: race.geo,
        status: "HOMOLOGADA",
        is_player: false,
        ballot_number: party.number,
        campaign: emptyCampaign(),
        votes: 0,
        vote_share: 0,
        note: null,
      };
      cand.status = "HOMOLOGADA";
      cand.note = led ? "Candidatura definida pela presidência do partido" : "Candidatura oficializada em convenção";
      if (!led) allocateFefc(ctx, cand, fefcTotal, camaraTotal, race.office_code === "PRESIDENTE" ? 0.15 : race.office_code === "GOVERNADOR" ? 0.012 : 0.006);
      ctx.save("candidacies", cand);
      chosen.stage = "CANDIDATO";
      ctx.save("persons", chosen);
      if (cand.is_player) ctx.notify(chosen.id, "Você é candidato(a)!", `A convenção do ${party.acronym} confirmou seu nome para ${OFFICES[race.office_code].name} em ${geoName(race.geo, ctx.s)}.`, "/jogo/campanha");
      if (race.office_code === "PRESIDENTE" || race.office_code === "GOVERNADOR" || cand.is_player) {
        ctx.publish("CONVENTION_RESULT", {
          facts: {
            party: party.acronym,
            name: chosen.name,
            office: OFFICES[race.office_code].name.toLowerCase(),
            geoName: geoName(race.geo, ctx.s),
            extra: isReal(chosen.kind) ? "A candidatura faz parte da linha do tempo simulada." : chosen.kind === "PLAYER" ? "Venceu a disputa interna da legenda." : "É aposta da legenda para renovar seus quadros.",
          },
          personIds: [chosen.id],
          geography: ufOfGeo(race.geo),
        });
      }
    }
  }
  // Pré-candidaturas que sobraram (partido não lançou ninguém)
  for (const c of pre) {
    if (c.status === "PRE") {
      c.status = "DESISTENTE";
      c.note = "O partido decidiu não lançar candidatura própria nesta disputa.";
      ctx.save("candidacies", c);
      ctx.notify(c.person_id, "Sem candidatura", c.note, "/jogo/carreira");
    }
  }
}

/** Fatia do FEFC de um partido (Lei 9.504, art. 16-D: 2% iguais, 35% por votos, 48% pela Câmara e 15% pelo Senado; aproximação do jogo). */
export function fefcPartyShare(party: PartyRow, camaraTotal: number): number {
  return 0.02 / 30 + 0.48 * ((party.seats.camara ?? 0) / camaraTotal) + (0.35 * nationalStrength(party)) / 4 + 0.15 * ((party.seats.senado ?? 0) / 81);
}

/** Valor total do FEFC na eleição (zero antes de 2018). */
export function fefcTotalFor(ctx: Ctx, e: ElectionRow): number {
  return eraRules(e.year).fefc ? ctx.s.ruleset.fefcReference * (e.kind === "GERAL" ? 1 : 0.6) : 0;
}

function allocateFefc(ctx: Ctx, c: CandidacyRow, fefcTotal: number, camaraTotal: number, share: number): void {
  const party = ctx.t.parties.get(c.party_id);
  if (!party) return;
  const partyShare = fefcPartyShare(party, camaraTotal);
  const st = ctx.pstate(c.person_id);
  const standing = c.is_player ? (st?.party_standing ?? 30) / 100 : 0.7;
  const amount = Math.round(fefcTotal * partyShare * share * (0.5 + standing));
  c.campaign.fefc = amount;
  c.campaign.budget += amount;
  if (amount > 0) {
    ctx.insert("finance_transactions", {
      id: ctx.id("fin", c.id, "fefc"),
      world_id: ctx.world.id,
      person_id: c.person_id,
      candidacy_id: c.id,
      kind: "FEFC",
      amount,
      declared: true,
      game_date: ctx.date,
      description: `Repasse do FEFC pelo ${party.acronym}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Campanha (NPCs), pesquisas e debates
// ---------------------------------------------------------------------------

export function dailyCampaign(ctx: Ctx, e: ElectionRow): void {
  const daysLeft = diffDays(e.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round, ctx.date);
  for (const c of ctx.t.candidacies.values()) {
    if (c.election_id !== e.id || !["HOMOLOGADA", "SEGUNDO_TURNO"].includes(c.status)) continue;
    if (e.status === "SEGUNDO_TURNO" && c.status !== "SEGUNDO_TURNO") continue;
    const rng = ctx.rng("campaign", c.id);
    const p = ctx.person(c.person_id);
    if (!p) continue;
    const st = ctx.pstate(p.id);
    if (!c.is_player) {
      // NPC: gasto diário e ganho de reconhecimento proporcional aos recursos
      const spend = Math.min(c.campaign.budget - c.campaign.spent, c.campaign.budget / Math.max(10, daysLeft));
      c.campaign.spent += Math.max(0, spend);
      if (st) {
        const uf = ufOfGeo(c.geo);
        const ufs = c.geo === "BR" ? UFS.map((u) => u.code) : [uf];
        for (const u of ufs) {
          const gain = 0.004 * (spend > 0 ? 1 : 0.3) * (1 - (st.reach[u] ?? 0));
          st.reach[u] = Math.min(0.98, (st.reach[u] ?? 0) + gain);
        }
        ctx.save("person_states", st);
      }
    }
    c.campaign.momentum = Math.max(-1, Math.min(1, c.campaign.momentum * 0.97 + rng.normal(0, 0.03)));
    c.campaign.rumor_damage = Math.max(0, c.campaign.rumor_damage * 0.98);
    ctx.save("candidacies", c);
  }
}

export function runPolls(ctx: Ctx, e: ElectionRow, onlyImportant: boolean): RaceRow[] {
  const polled: RaceRow[] = [];
  const daysLeft = diffDays(e.status === "SEGUNDO_TURNO" ? e.runoff : e.first_round, ctx.date);
  const races = [...ctx.t.races.values()].filter((r) => r.election_id === e.id && OFFICES[r.office_code].system === "MAJORITARIO" && r.status !== "ENCERRADA");
  for (const race of races) {
    const cands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && (e.status === "SEGUNDO_TURNO" ? c.status === "SEGUNDO_TURNO" : c.status === "HOMOLOGADA"));
    if (cands.length < 2) continue;
    const hasPlayer = cands.some((c) => c.is_player);
    const important = race.office_code === "PRESIDENTE" || hasPlayer || (race.office_code === "GOVERNADOR" && ["SP", "MG", "RJ", "BA", "RS"].includes(race.geo));
    if (onlyImportant && !important) continue;
    const tally = tallyMajoritarian(ctx, race, cands);
    const rng = ctx.rng("poll", race.id);
    const inst = rng.pick(POLL_INSTITUTES);
    const sample = race.geo === "BR" ? 2000 : 1200;
    const undecided = Math.max(3, Math.min(30, daysLeft * 0.25 + rng.normal(0, 2)));
    const results = cands
      .map((c) => {
        const p = (tally.votes.get(c.id) ?? 0) / (tally.valid || 1);
        const sd = Math.sqrt((p * (1 - p)) / sample);
        const pct = Math.max(0, (p + rng.normal(0, sd) + inst.house * 0.005 * (c.party_id.length % 2 ? 1 : -1)) * (100 - undecided));
        const person = ctx.person(c.person_id)!;
        return { id: c.id, name: person.name, party: ctx.t.parties.get(c.party_id)?.acronym ?? "", pct: Math.round(pct * 10) / 10 };
      })
      .sort((a, b) => b.pct - a.pct);
    const margin = Math.round(196 * Math.sqrt(0.25 / sample) * 10) / 10;
    ctx.insert("polls", {
      id: ctx.id("poll", race.id),
      world_id: ctx.world.id,
      race_id: race.id,
      institute: inst.name,
      game_date: ctx.date,
      sample,
      margin,
      results,
      undecided: Math.round(undecided),
      private_for: null,
    });
    race.latest_poll = Object.fromEntries(results.map((r) => [r.id, r.pct]));
    ctx.save("races", race);
    polled.push(race);
    if (important && results.length >= 2) {
      ctx.publish("POLL_RELEASE", {
        facts: {
          institute: inst.name,
          leader: results[0].name,
          leaderParty: results[0].party,
          leaderPct: results[0].pct.toFixed(1).replace(".", ","),
          second: results[1].name,
          secondParty: results[1].party,
          secondPct: results[1].pct.toFixed(1).replace(".", ","),
          undecided: Math.round(undecided),
          margin: margin.toFixed(1).replace(".", ","),
          office: OFFICES[race.office_code].name.toLowerCase(),
          geoName: geoName(race.geo, ctx.s),
        },
        personIds: cands.map((c) => c.person_id),
        geography: ufOfGeo(race.geo),
      });
    }
  }
  return polled;
}

/** Debates: presidenciais e os que envolvem jogadores. */
export function scheduleDebates(ctx: Ctx, e: ElectionRow, round: 1 | 2): void {
  const dates = round === 1 ? [addDays(e.first_round, -30), addDays(e.first_round, -4)] : [addDays(e.runoff, -5)];
  for (const race of ctx.t.races.values()) {
    if (race.election_id !== e.id || OFFICES[race.office_code].system !== "MAJORITARIO") continue;
    const cands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && (round === 2 ? c.status === "SEGUNDO_TURNO" : c.status === "HOMOLOGADA"));
    if (cands.length < 2) continue;
    if (!(race.office_code === "PRESIDENTE" || cands.some((c) => c.is_player) || race.office_code === "GOVERNADOR")) continue;
    for (const d of dates) {
      ctx.save("debates", {
        id: `deb_${race.id}_${d}`,
        world_id: ctx.world.id,
        race_id: race.id,
        outlet: ctx.rng("debate-outlet", `${race.id}${d}`).pick(["Rede Aurora", "Canal Horizonte"]),
        scheduled_on: d,
        status: "AGENDADO",
        participants: cands.map((c) => c.id),
        results: {},
        player_choices: {},
      });
    }
    for (const c of cands.filter((c) => c.is_player)) {
      ctx.notify(c.person_id, "Debates agendados", `Você participará de debate(s) em ${dates.map(formatDatePt).join(" e ")}. Prepare-se e escolha sua estratégia na página da campanha.`, "/jogo/campanha");
    }
  }
}

export const DEBATE_THEMES = ["economia", "segurança pública", "saúde", "educação", "corrupção", "meio ambiente", "emprego"];

/** Tema que vai dominar o debate (sorteado no dia, estável por debate). */
export function debateTheme(ctx: Ctx, d: DebateRow): string {
  return rngFor(ctx.world.seed, "debate-theme", 0, d.id).pick(DEBATE_THEMES);
}

/**
 * Debates do dia. Com jogador no palco, o debate fica "ao vivo": cada jogador
 * responde ao momento decisivo (acontecimento da carreira) e o placar fecha
 * quando todos tiverem respondido, ou no máximo dois dias depois.
 */
export function runDebates(ctx: Ctx): DebateRow[] {
  const live: DebateRow[] = [];
  for (const d of ctx.t.debates.values()) {
    if (d.status === "AO_VIVO" && diffDays(ctx.date, d.scheduled_on) >= 2) {
      finishDebate(ctx, d);
      continue;
    }
    if (d.status !== "AGENDADO" || d.scheduled_on !== ctx.date) continue;
    const players = d.participants.filter((cid) => {
      const c = ctx.t.candidacies.get(cid);
      const p = c && ctx.person(c.person_id);
      return !!c?.is_player && p?.status === "ACTIVE";
    });
    if (players.length) {
      d.status = "AO_VIVO";
      ctx.save("debates", d);
      live.push(d);
      continue;
    }
    finishDebate(ctx, d);
  }
  return live;
}

/** Registra a resposta de um jogador no momento decisivo do debate; fecha o placar quando todos responderem. */
export function settleDebateMoment(ctx: Ctx, debateId: string, candidacyId: string, bonus: number): DebateRow | null {
  const d = ctx.t.debates.get(debateId);
  if (!d || d.status !== "AO_VIVO") return null;
  const prev = d.player_choices[candidacyId] ?? { theme: "", stance: "PROPOSITIVO", risk: 0.2 };
  d.player_choices[candidacyId] = { ...prev, live: Math.round(bonus * 1000) / 1000 };
  ctx.save("debates", d);
  const waiting = d.participants.some((cid) => {
    const c = ctx.t.candidacies.get(cid);
    const p = c && ctx.person(c.person_id);
    return !!c?.is_player && p?.status === "ACTIVE" && d.player_choices[cid]?.live === undefined;
  });
  if (!waiting) finishDebate(ctx, d);
  return d;
}

/** Placar do debate: preparo, conhecimento, retórica, sintonia com o eleitorado, cansaço, histórico, estratégia e o momento decisivo. */
export function finishDebate(ctx: Ctx, d: DebateRow): void {
  if (d.status === "REALIZADO") return;
  const race = ctx.t.races.get(d.race_id);
  if (!race) return;
  const rng = ctx.rng("debate", d.id);
  const theme = debateTheme(ctx, d);
  const scores: Record<string, number> = {};
  for (const cid of d.participants) {
    const c = ctx.t.candidacies.get(cid);
    if (!c) continue;
    const p = ctx.person(c.person_id)!;
    const st = ctx.pstate(p.id);
    const traits = st?.traits;
    const choice = d.player_choices[cid];
    const prep = (st?.debate_prep ?? 20) / 100;
    const knowledge = traits?.competence ?? 0.5;
    const rhetoric = traits?.charisma ?? 0.5;
    const fatigue = st ? (100 - st.energy) / 200 : 0;
    const history = (st?.scandal ?? 0) / 150;
    const segs = segmentsOf(ctx, race.geo === "BR" ? "SP" : ufOfGeo(race.geo));
    const fit = segs.reduce((s, sg) => s + ideologyAffinity(sg.ideology, p.ideology) * sg.weight, 0);
    let risk = 0.15;
    let stanceBonus = 0;
    if (choice) {
      risk = choice.risk;
      stanceBonus = choice.stance === "ATAQUE" ? 0.05 : choice.stance === "PROPOSITIVO" ? 0.04 : 0.02;
      if (choice.theme === theme) stanceBonus += 0.08;
      stanceBonus += choice.live ?? 0;
    } else if (c.is_player) {
      stanceBonus = -0.1;
    }
    const score = prep * 0.25 + knowledge * 0.2 + rhetoric * 0.2 + fit * 0.2 - fatigue - history + stanceBonus + rng.normal(0, 0.05 + risk * 0.2);
    scores[cid] = Math.round(score * 1000) / 1000;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const mean = ranked.reduce((s, [, v]) => s + v, 0) / (ranked.length || 1);
  for (const [cid, v] of ranked) {
    const c = ctx.t.candidacies.get(cid)!;
    c.campaign.debate_score = Math.max(-0.6, Math.min(0.6, c.campaign.debate_score * 0.5 + (v - mean) * 1.5));
    if (c.is_player) {
      (c.campaign.journal ??= []).push({ on: ctx.date, cause: `debate na ${d.outlet}`, delta: Math.round((v - mean) * 1.5 * 1000) / 1000 });
      const pos = ranked.findIndex(([id]) => id === cid) + 1;
      ctx.notify(c.person_id, "Resultado do debate", `Na avaliação dos analistas, você ficou em ${pos}º de ${ranked.length} no debate da ${d.outlet} (${v >= mean ? "acima" : "abaixo"} da média). Tema mais citado: ${theme}.`, "/jogo/campanha");
    }
    ctx.save("candidacies", c);
  }
  d.status = "REALIZADO";
  d.results = scores;
  ctx.save("debates", d);
  const winner = ranked.length ? ctx.person(ctx.t.candidacies.get(ranked[0][0])?.person_id) : undefined;
  const loser = ranked.length ? ctx.person(ctx.t.candidacies.get(ranked[ranked.length - 1][0])?.person_id) : undefined;
  if (winner && loser && winner !== loser) {
    ctx.publish("DEBATE_RESULT", {
      facts: { outlet: d.outlet, winner: winner.name, loser: loser.name, office: OFFICES[race.office_code].name.toLowerCase(), geoName: geoName(race.geo, ctx.s), theme },
      personIds: [winner.id, loser.id],
      geography: ufOfGeo(race.geo),
    });
  }
}

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

function resultsOf(ctx: Ctx, cands: CandidacyRow[], tally: RaceTally): CandidateResult[] {
  return cands
    .map((c) => ({
      candidacy_id: c.id,
      person_id: c.person_id,
      name: ctx.person(c.person_id)?.name ?? "?",
      party_id: c.party_id,
      votes: tally.votes.get(c.id) ?? 0,
      share: Math.round(((tally.votes.get(c.id) ?? 0) / (tally.valid || 1)) * 10000) / 100,
    }))
    .sort((a, b) => b.votes - a.votes);
}

export function runFirstRound(ctx: Ctx, e: ElectionRow): void {
  let anyRunoff = false;
  // força estadual dos partidos no dia: base do resultado nas cidades sem disputa ativa
  if (e.kind === "MUNICIPAL") e.summary = { ...e.summary, cityTerritory: snapshotTerritory(ctx.t.parties.values()) };
  for (const race of [...ctx.t.races.values()].filter((r) => r.election_id === e.id)) {
    if (OFFICES[race.office_code].system === "PROPORCIONAL") {
      runProportional(ctx, e, race);
      continue;
    }
    const cands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && c.status === "HOMOLOGADA");
    if (!cands.length) {
      race.status = "ENCERRADA";
      ctx.save("races", race);
      continue;
    }
    const tally = tallyMajoritarian(ctx, race, cands);
    const results = resultsOf(ctx, cands, tally);
    race.results.first = { candidates: results, turnout: tally.turnout, invalid: tally.invalid, valid: tally.valid };
    for (const r of results) {
      const c = ctx.t.candidacies.get(r.candidacy_id)!;
      c.votes = r.votes;
      c.vote_share = r.share;
    }
    const rule = OFFICES[race.office_code];
    const needsRunoff =
      rule.runoff && results[0].share <= 50 && results.length > 1 && (race.office_code !== "PREFEITO" || race.electorate > ctx.s.ruleset.municipalRunoffElectorate);
    if (needsRunoff) {
      anyRunoff = true;
      race.status = "SEGUNDO_TURNO";
      for (const r of results) {
        const c = ctx.t.candidacies.get(r.candidacy_id)!;
        c.status = r === results[0] || r === results[1] ? "SEGUNDO_TURNO" : "NAO_ELEITO";
        ctx.save("candidacies", c);
        if (c.is_player) ctx.notify(c.person_id, c.status === "SEGUNDO_TURNO" ? "Você está no 2º turno!" : "Fim da linha no 1º turno", `Você teve ${r.share.toFixed(2)}% dos votos válidos.`, "/jogo/campanha");
      }
      const [a, b] = results;
      ctx.publish("RUNOFF_SET", {
        facts: {
          office: rule.name,
          geoName: geoName(race.geo, ctx.s),
          first: a.name,
          firstParty: ctx.t.parties.get(a.party_id)?.acronym ?? "",
          firstShare: a.share.toFixed(2).replace(".", ","),
          second: b.name,
          secondParty: ctx.t.parties.get(b.party_id)?.acronym ?? "",
          secondShare: b.share.toFixed(2).replace(".", ","),
          runoffDate: formatDatePt(e.runoff),
        },
        personIds: [a.person_id, b.person_id],
        geography: ufOfGeo(race.geo),
      });
    } else {
      const winners = results.slice(0, race.seats);
      finalizeMajoritarian(ctx, e, race, results, winners.map((w) => w.candidacy_id), tally);
    }
    ctx.save("races", race);
  }
  e.status = anyRunoff ? "SEGUNDO_TURNO" : "ENCERRADA";
  ctx.save("elections", e);
  if (anyRunoff) scheduleDebates(ctx, e, 2);
}

export function runRunoff(ctx: Ctx, e: ElectionRow): void {
  for (const race of [...ctx.t.races.values()].filter((r) => r.election_id === e.id && r.status === "SEGUNDO_TURNO")) {
    const cands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && c.status === "SEGUNDO_TURNO");
    const tally = tallyMajoritarian(ctx, race, cands);
    const results = resultsOf(ctx, cands, tally);
    race.results.runoff = { candidates: results, turnout: tally.turnout, invalid: tally.invalid, valid: tally.valid };
    for (const r of results) {
      const c = ctx.t.candidacies.get(r.candidacy_id)!;
      c.votes = r.votes;
      c.vote_share = r.share;
    }
    finalizeMajoritarian(ctx, e, race, results, [results[0].candidacy_id], tally);
    ctx.save("races", race);
  }
  e.status = "ENCERRADA";
  ctx.save("elections", e);
}

function finalizeMajoritarian(ctx: Ctx, e: ElectionRow, race: RaceRow, results: CandidateResult[], winnerIds: string[], tally: RaceTally): void {
  race.status = "ENCERRADA";
  race.results.elected = winnerIds.map((id) => ctx.t.candidacies.get(id)!.person_id);
  for (const r of results) {
    const c = ctx.t.candidacies.get(r.candidacy_id)!;
    const won = winnerIds.includes(c.id);
    c.status = won ? "ELEITO" : "NAO_ELEITO";
    ctx.save("candidacies", c);
    const p = ctx.person(c.person_id)!;
    if (won) {
      createMandate(ctx, p, race.office_code, race.geo, e);
    }
    afterElection(ctx, p, won, race);
    if (c.is_player) ctx.notify(p.id, won ? "VOCÊ FOI ELEITO(A)!" : "Não foi desta vez", `${OFFICES[race.office_code].name} em ${geoName(race.geo, ctx.s)}: ${r.share.toFixed(2)}% dos votos válidos.`, "/jogo/carreira");
  }
  const w = results.find((r) => winnerIds.includes(r.candidacy_id))!;
  const ru = results.find((r) => !winnerIds.includes(r.candidacy_id));
  if (race.office_code !== "SENADOR" || winnerIds[0] === w.candidacy_id) {
    ctx.publish("ELECTION_RESULT", {
      facts: {
        winner: w.name,
        winnerParty: ctx.t.parties.get(w.party_id)?.acronym ?? "",
        office: OFFICES[race.office_code].name.toLowerCase(),
        geoName: geoName(race.geo, ctx.s),
        winnerShare: w.share.toFixed(2).replace(".", ","),
        runnerUp: ru?.name ?? "—",
        runnerUpParty: ru ? ctx.t.parties.get(ru.party_id)?.acronym ?? "" : "",
        runnerUpShare: ru ? ru.share.toFixed(2).replace(".", ",") : "0",
        turnout: ((tally.turnout / (race.electorate || 1)) * 100).toFixed(1).replace(".", ","),
      },
      personIds: [w.person_id, ...(ru ? [ru.person_id] : [])],
      geography: ufOfGeo(race.geo),
      importance: race.office_code === "PRESIDENTE" ? 3 : 2,
    });
  }
}

function afterElection(ctx: Ctx, p: PersonRow, won: boolean, race: RaceRow): void {
  if (!won) {
    if (p.stage === "CANDIDATO") p.stage = p.office_code ? "MANDATO" : p.party_id ? "QUADRO" : "CIDADAO";
    p.reputation = Math.max(0, p.reputation - 2);
  } else {
    p.reputation = Math.min(100, p.reputation + 5);
    const st = ctx.pstate(p.id);
    if (st) {
      const ufs = race.geo === "BR" ? UFS.map((u) => u.code) : [ufOfGeo(race.geo)];
      for (const u of ufs) st.reach[u] = Math.min(0.98, (st.reach[u] ?? 0) + 0.15);
      ctx.save("person_states", st);
    }
    if (p.stage === "CANDIDATO") p.stage = p.office_code ? "MANDATO" : "QUADRO";
  }
  ctx.save("persons", p);
}

export function createMandate(ctx: Ctx, p: PersonRow, office: OfficeCode, geo: string, e: ElectionRow): void {
  ctx.save("mandates", {
    id: ctx.id("man", p.id, office, e.id),
    world_id: ctx.world.id,
    person_id: p.id,
    office_code: office,
    geo,
    start_on: inaugurationDate(office, e.year),
    end_on: termEnd(office, e.year),
    status: "FUTURO",
    election_id: e.id,
    approval: 50,
  });
}

/** Eleição proporcional: votos por legenda, quociente e sobras (D'Hondt), ranking interno. */
export function runProportional(ctx: Ctx, e: ElectionRow, race: RaceRow): void {
  const uf = ufOfGeo(race.geo);
  const rng = ctx.rng("proportional", race.id);
  const era = eraRules(e.year);
  const parties = [...ctx.t.parties.values()].filter((p) => p.status === "ATIVO" && (p.territory[uf] ?? 0) > 0.005);
  const playerCands = [...ctx.t.candidacies.values()].filter((c) => c.race_id === race.id && c.status === "HOMOLOGADA");
  const contenders: Contender[] = parties.map((p) => {
    const boost = playerCands.filter((c) => c.party_id === p.id).reduce((s, c) => s + 0.05 + c.campaign.momentum * 0.1, 0);
    return {
      id: p.id,
      ideology: p.ideology,
      reputation: p.reputation,
      recognition: 0.3 + 0.7 * (p.territory[uf] ?? 0),
      partyStrength: (p.territory[uf] ?? 0) * 1.5,
      govAlignment: p.gov_alignment,
      incumbent: false,
      momentum: boost,
      scandal: (0.5 - p.integrity) * 60,
      noise: rngFor(ctx.world.seed, "latent-party", 0, `${race.id}:${p.id}`).normal(0, 0.25),
    };
  });
  const res = ufShares(segmentsOf(ctx, uf), contenders, ctx.world.gov.approval, 0);
  const t = race.electorate * res.turnout;
  const valid = t * (1 - res.invalidShare);
  // Federações (desde 2022) funcionam como uma lista única
  const listOf = (p: PartyRow) => (era.federations && p.federation ? `fed:${p.federation}` : p.id);
  const listVotes = new Map<string, number>();
  const partyVotes = new Map<string, number>();
  for (const p of parties) {
    const v = valid * (res.shares.get(p.id) ?? 0);
    partyVotes.set(p.id, v);
    listVotes.set(listOf(p), (listVotes.get(listOf(p)) ?? 0) + v);
  }
  const seats = race.seats;
  const qe = valid / seats;
  const listSeats = new Map<string, number>();
  for (const [l, v] of listVotes) listSeats.set(l, Math.floor(v / qe));
  let remaining = seats - [...listSeats.values()].reduce((a, b) => a + b, 0);
  const eligible = [...listVotes.entries()].filter(([, v]) => v >= qe * 0.8).map(([l]) => l);
  while (remaining > 0) {
    let best: string | null = null;
    let bestAvg = -1;
    for (const l of eligible.length ? eligible : [...listVotes.keys()]) {
      const avg = (listVotes.get(l) ?? 0) / ((listSeats.get(l) ?? 0) + 1);
      if (avg > bestAvg) {
        bestAvg = avg;
        best = l;
      }
    }
    if (!best) break;
    listSeats.set(best, (listSeats.get(best) ?? 0) + 1);
    remaining--;
  }
  // Distribui cadeiras da lista entre os partidos da federação, proporcional aos votos
  const partySeats = new Map<string, number>();
  for (const [l, s] of listSeats) {
    const members = parties.filter((p) => listOf(p) === l).sort((a, b) => (partyVotes.get(b.id) ?? 0) - (partyVotes.get(a.id) ?? 0));
    const total = members.reduce((a, p) => a + (partyVotes.get(p.id) ?? 0), 0) || 1;
    let given = 0;
    members.forEach((p, i) => {
      const n = i === members.length - 1 ? s - given : Math.round((s * (partyVotes.get(p.id) ?? 0)) / total);
      partySeats.set(p.id, Math.max(0, n));
      given += Math.max(0, n);
    });
  }

  // Ranking interno de cada partido: incumbentes reais/procedurais, jogadores e vagas abstratas
  const electedIds: string[] = [];
  for (const party of parties) {
    const won = partySeats.get(party.id) ?? 0;
    const named: Array<{ id: string; strength: number; isPlayer: boolean; candidacy?: CandidacyRow }> = [];
    const incumbents = [...ctx.t.persons.values()].filter(
      (p) => p.party_id === party.id && p.office_code === race.office_code && p.office_geo === race.geo && p.status === "ACTIVE" && p.stage !== "CANDIDATO",
    );
    for (const p of incumbents) {
      const st = ctx.pstate(p.id);
      if (st?.ineligible_until && st.ineligible_until > e.first_round) continue;
      if (ageAt(p.birth_year, ctx.date) > 78 && rng.chance(0.6)) continue;
      named.push({ id: p.id, strength: Math.exp(-0.2 + 2.2 * (st?.reach[uf] ?? 0.2) + rng.normal(0, 0.5)), isPlayer: false });
    }
    for (const c of playerCands.filter((c) => c.party_id === party.id)) {
      const strength = playerListStrength(ctx, race, c, rng.normal(0, 0.3));
      named.push({ id: c.person_id, strength, isPlayer: true, candidacy: c });
    }
    const listSize = Math.max(won + 1, Math.min(seats + 1, Math.round(won * 2.5 + 3)));
    const abstract: number[] = [];
    for (let i = named.length; i < listSize; i++) abstract.push(Math.exp(rng.normal(0, 0.8)));
    const totalStrength = named.reduce((s, n) => s + n.strength, 0) + abstract.reduce((s, v) => s + v, 0) || 1;
    const pv = partyVotes.get(party.id) ?? 0;
    const all = [
      ...named.map((n) => ({ ...n, votes: (pv * 0.92 * n.strength) / totalStrength })),
      ...abstract.map((s, i) => ({ id: `abs_${i}`, strength: s, isPlayer: false, candidacy: undefined, votes: (pv * 0.92 * s) / totalStrength })),
    ].sort((a, b) => b.votes - a.votes);
    const minIndividual = e.year >= 2016 ? qe * 0.1 : 0;
    let filled = 0;
    for (const entry of all) {
      const winsSeat = filled < won && entry.votes >= minIndividual;
      if (winsSeat) filled++;
      if (entry.isPlayer && entry.candidacy) {
        const c = entry.candidacy;
        c.votes = Math.round(entry.votes);
        c.vote_share = Math.round((entry.votes / valid) * 10000) / 100;
        c.status = winsSeat ? "ELEITO" : "SUPLENTE";
        ctx.save("candidacies", c);
        const p = ctx.person(c.person_id)!;
        if (winsSeat) createMandate(ctx, p, race.office_code, race.geo, e);
        afterElection(ctx, p, winsSeat, race);
        ctx.notify(p.id, winsSeat ? "VOCÊ FOI ELEITO(A)!" : "Suplência", `${OFFICES[race.office_code].name} em ${geoName(race.geo, ctx.s)}: ${Math.round(entry.votes).toLocaleString("pt-BR")} votos. O ${party.acronym} fez ${won} cadeira(s).`, "/jogo/carreira");
        if (winsSeat) electedIds.push(p.id);
      } else if (winsSeat) {
        if (entry.id.startsWith("abs_")) {
          const np = spawnProceduralCadre(ctx, { partyId: party.id, uf, ideology: party.ideology, roleLabel: `${OFFICES[race.office_code].name.toLowerCase()} do ${party.acronym}`, ageRange: [26, 60], reputation: 45, tier: race.office_code === "DEP_FEDERAL" ? 2 : 3 });
          const st = ctx.pstate(np.id)!;
          st.reach[uf] = 0.15 + Math.min(0.4, entry.strength / 10);
          ctx.save("person_states", st);
          createMandate(ctx, np, race.office_code, race.geo, e);
          electedIds.push(np.id);
        } else {
          const p = ctx.person(entry.id)!;
          createMandate(ctx, p, race.office_code, race.geo, e);
          electedIds.push(p.id);
        }
      }
    }
  }
  const partyResults: PartyListResult[] = parties
    .map((p) => ({ party_id: p.id, votes: Math.round(partyVotes.get(p.id) ?? 0), share: Math.round(((partyVotes.get(p.id) ?? 0) / valid) * 10000) / 100, seats: partySeats.get(p.id) ?? 0 }))
    .filter((r) => r.votes > 0)
    .sort((a, b) => b.seats - a.seats || b.votes - a.votes);
  race.results.first = { candidates: [], parties: partyResults, turnout: Math.round(t), invalid: Math.round(t - valid), valid: Math.round(valid) };
  race.results.elected = electedIds;
  race.status = "ENCERRADA";
  ctx.save("races", race);
  const summary = (e.summary.pendingSeats as Record<string, Record<string, number>> | undefined) ?? {};
  summary[`${race.office_code}:${race.geo}`] = Object.fromEntries(partyResults.filter((r) => r.seats > 0).map((r) => [r.party_id, r.seats]));
  e.summary.pendingSeats = summary;
  ctx.save("elections", e);
  if (race.office_code === "DEP_FEDERAL" && ["SP", "MG", "RJ", "BA"].includes(uf)) {
    const top = partyResults[0];
    const topParty = ctx.t.parties.get(top.party_id);
    if (topParty) {
      ctx.publish("PROPORTIONAL_RESULT", {
        facts: {
          office: OFFICES[race.office_code].name,
          geoName: geoName(race.geo, ctx.s),
          topParty: topParty.acronym,
          topSeats: top.seats,
          seats,
          summary: partyResults.slice(1, 4).map((r) => `${ctx.t.parties.get(r.party_id)?.acronym}: ${r.seats}`).join("; ") + ".",
        },
        geography: uf,
      });
    }
  }
}

/** Posse e fim de mandatos; atualiza bancadas e Presidência. */
export function processMandates(ctx: Ctx): void {
  for (const m of ctx.t.mandates.values()) {
    if (m.status === "ATIVO" && m.end_on <= ctx.date) {
      m.status = "ENCERRADO";
      ctx.save("mandates", m);
      const p = ctx.person(m.person_id);
      if (p && p.office_code === m.office_code && p.office_geo === m.geo) {
        p.office_code = null;
        p.office_geo = null;
        if (p.stage === "MANDATO") p.stage = p.party_id ? "QUADRO" : "CIDADAO";
        ctx.save("persons", p);
      }
    }
  }
  for (const m of ctx.t.mandates.values()) {
    if (m.status === "FUTURO" && m.start_on <= ctx.date) {
      m.status = "ATIVO";
      ctx.save("mandates", m);
      const p = ctx.person(m.person_id);
      if (!p) continue;
      if (!p.office_code || OFFICES[m.office_code].rank >= OFFICES[p.office_code].rank) {
        p.office_code = m.office_code;
        p.office_geo = m.geo;
      }
      p.stage = "MANDATO";
      ctx.save("persons", p);
      if (m.office_code === "PRESIDENTE") {
        ctx.world.gov.president_id = p.id;
        const party = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
        if (party) {
          const presParty = party;
          for (const other of ctx.t.parties.values()) {
            const aff = ideologyAffinity(other.ideology, presParty.ideology);
            other.gov_alignment = other.id === presParty.id || aff > 0.82 ? 1 : aff < 0.62 ? -1 : 0;
            ctx.save("parties", other);
          }
          ctx.world.gov.base_party_ids = [...ctx.t.parties.values()].filter((x) => x.gov_alignment === 1).map((x) => x.id);
        }
        ctx.world.gov.approval = 55;
        ctx.saveWorld();
      }
      if (m.office_code === "PRESIDENTE" || m.office_code === "GOVERNADOR" || p.kind === "PLAYER") {
        ctx.publish("INAUGURATION", { facts: { name: p.name, office: OFFICES[m.office_code].name.toLowerCase(), geoName: geoName(m.geo, ctx.s), endDate: formatDatePt(m.end_on) }, personIds: [p.id], geography: ufOfGeo(m.geo) });
      }
      if (p.kind === "PLAYER") ctx.notify(p.id, "Posse!", `Você tomou posse como ${OFFICES[m.office_code].name}. Mandato até ${formatDatePt(m.end_on)}.`, "/jogo/governo");
    }
  }
  // Bancadas proporcionais: aplicadas na posse
  for (const e of ctx.t.elections.values()) {
    const pending = e.summary.pendingSeats as Record<string, Record<string, number>> | undefined;
    if (!pending) continue;
    let changed = false;
    for (const [key, seats] of Object.entries(pending)) {
      const [office, geo] = key.split(":") as [OfficeCode, string];
      if (inaugurationDate(office, e.year) !== ctx.date) continue;
      if (office === "VEREADOR" && !isCapital(geo)) continue; // câmaras do interior ficam no resultado da disputa
      const seatKey = office === "DEP_FEDERAL" ? "camara" : office === "DEP_ESTADUAL" ? `assembleia_${geo}` : `camara_mun_${ufOfGeo(geo)}`;
      for (const p of ctx.t.parties.values()) {
        if (office === "DEP_FEDERAL") {
          // recontagem nacional: soma todas as UFs desta eleição
          continue;
        }
        p.seats[seatKey] = seats[p.id] ?? 0;
        ctx.save("parties", p);
      }
      changed = true;
    }
    if (changed) {
      const fed = Object.entries(pending).filter(([k]) => k.startsWith("DEP_FEDERAL:"));
      if (fed.length && inaugurationDate("DEP_FEDERAL", e.year) === ctx.date) {
        for (const p of ctx.t.parties.values()) {
          p.seats.camara = fed.reduce((s, [, seats]) => s + (seats[p.id] ?? 0), 0);
          ctx.save("parties", p);
        }
      }
      // Senado e governos: recontagem por mandatos ativos
      for (const p of ctx.t.parties.values()) {
        p.seats.senado = [...ctx.t.mandates.values()].filter((m) => m.status === "ATIVO" && m.office_code === "SENADOR" && ctx.person(m.person_id)?.party_id === p.id).length;
        p.seats.governos = [...ctx.t.mandates.values()].filter((m) => m.status === "ATIVO" && m.office_code === "GOVERNADOR" && ctx.person(m.person_id)?.party_id === p.id).length;
        ctx.save("parties", p);
      }
    }
  }
}

/** Atualiza a força territorial dos partidos depois de uma eleição proporcional. */
export function updateTerritoryFromResults(ctx: Ctx, e: ElectionRow): void {
  for (const race of ctx.t.races.values()) {
    if (race.election_id !== e.id || race.office_code !== (e.kind === "GERAL" ? "DEP_FEDERAL" : "VEREADOR")) continue;
    if (race.office_code === "VEREADOR" && !isCapital(race.geo)) continue;
    const uf = ufOfGeo(race.geo);
    for (const r of race.results.first?.parties ?? []) {
      const p = ctx.t.parties.get(r.party_id);
      if (!p) continue;
      const fresh = Math.min(1, (r.share / 100) * 4);
      p.territory[uf] = Math.round(((p.territory[uf] ?? 0) * (e.kind === "GERAL" ? 0.4 : 0.75) + fresh * (e.kind === "GERAL" ? 0.6 : 0.25)) * 1000) / 1000;
      ctx.save("parties", p);
    }
  }
}

export function electionYearOf(d: ISODate): number {
  return year(d);
}
