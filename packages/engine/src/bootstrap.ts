import { addDays, type ISODate } from "./calendar";
import { priceLevel } from "./finance";
import { capitalId, UFS, UF_BY_CODE, type CityBase, type Region } from "./geo";
import { snapshotTerritory } from "./cities";
import { clampAxis, jitter, makeIdeology, spectrumLabel, type Ideology } from "./ideology";
import { buildPerson, neutralRealTraits, spawnProceduralCadre } from "./npc";
import { FACTION_TEMPLATES, profileFor, resolveAcronym } from "./parties";
import { Rng } from "./rng";
import { DEFAULT_RULESET, electionCalendar, inaugurationDate, senateSeatsForYear, termEnd, type OfficeCode } from "./ruleset";
import { generateSegments } from "./segments";
import { findRace, type Snapshot, type SnapshotCandidate, type SnapshotPerson, type SnapshotRace } from "./snapshot";
import { Changes, Ctx, emptyTables, STATEFUL_TABLES, type WorldState } from "./state";
import { ufShares, type Contender } from "./support";
import type {
  CandidacyRow,
  ElectionRow,
  EconomyRow,
  FactionRow,
  MandateRow,
  PartyRow,
  PersonRow,
  RaceRow,
  VoterSegmentRow,
  WorldRow,
} from "./types";

/** Pontos de partida jogáveis: o dia seguinte a cada 2º turno presidencial desde 2002. */
export const START_YEARS = [2002, 2006, 2010, 2014, 2018, 2022, 2026] as const;
export type StartYear = (typeof START_YEARS)[number];

export interface BootstrapOptions {
  worldId: string;
  seed: string;
  name?: string;
  startRealAt: string;
  gameDaysPerRealHour?: number;
  /** dados reais dos municípios no ponto de partida (data/municipios-<ano>.json) */
  cities?: CityBase[];
}

export function partyIdFor(number: number): string {
  return `pty_${number}`;
}

function normName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const OPPOSITION_SPECTRUM_THRESHOLD = 45;



/**
 * Cria o mundo a partir do snapshot real de 26/10/2026.
 * Devolve o estado completo e as mudanças (tudo o que deve ser gravado).
 */
export function createInitialWorld(snap: Snapshot, opts: BootstrapOptions): { state: WorldState; changes: Changes } {
  normalizeElectedFlags(snap);
  const Y = snap.meta.year;
  const SNAPSHOT_DATE: ISODate = snap.meta.snapshot_date;
  const available = new Set(snap.parties.map((p) => p.acronym));
  const canon = (acr: string) => resolveAcronym(acr, available) ?? acr;
  const world: WorldRow = {
    id: opts.worldId,
    name: opts.name ?? `Brasil pós-${Y}`,
    seed: opts.seed,
    ruleset_version: DEFAULT_RULESET.version,
    tick: 0,
    game_date: SNAPSHOT_DATE,
    start_game_date: SNAPSHOT_DATE,
    anchor_real_at: opts.startRealAt,
    anchor_tick: 0,
    game_days_per_real_hour: opts.gameDaysPerRealHour ?? 2,
    election_integrity_mode: false,
    gov: { president_id: null, approval: 50, fiscal_stance: 0.2, base_party_ids: [] },
    // nível de preços real no ponto de partida; daí em diante, o IPCA simulado
    stats: { price_level: priceLevel(SNAPSHOT_DATE) },
  };
  const economy = initialEconomy(snap, world.id);
  const state: WorldState = { world, economy, ruleset: DEFAULT_RULESET, t: emptyTables(), cities: new Map((opts.cities ?? []).map((c) => [c.id, c])) };
  // Prefeito de capital: os dados municipais já trazem o vice que assumiu e as correções documentadas
  const capitalMayor = (uf: string, fallback: SnapshotPerson | null): SnapshotPerson | null => {
    const c = state.cities?.get(capitalId(uf))?.mayor;
    return c ? { sq: c.sq ?? `${Y}-${uf}-prefeito`, name: c.name, party: c.party, party_number: c.party_number, birth_year: c.birth_year } : fallback;
  };
  const ctx = new Ctx(state, "bootstrap");
  const rng = new Rng(`${opts.seed}|bootstrap`);

  // ------------------------------------------------------------------ partidos
  const presR1 = findRace(snap, "PRESIDENTE", "BR", 1);
  const presFinal = findRace(snap, "PRESIDENTE", "BR", 2) ?? presR1;
  const winnerParty = presFinal?.candidates.find((c) => c.elected)?.party ?? "";
  const winnerCoalition = presR1?.coalitions.find((c) => c.members.includes(winnerParty))?.members ?? [winnerParty];
  const fedByCode = new Map(snap.federations.map((f) => [f.code, f]));
  const seatsByParty = new Map<string, Record<string, number>>();
  const addSeat = (rawAcr: string, key: string, n = 1) => {
    const acr = canon(rawAcr);
    const m = seatsByParty.get(acr) ?? {};
    m[key] = (m[key] ?? 0) + n;
    seatsByParty.set(acr, m);
  };
  for (const r of snap.races) {
    if (r.round === 2) continue;
    for (const c of r.candidates.filter((c) => c.elected)) {
      if (r.office === "DEP_FEDERAL") addSeat(c.party, "camara");
      if (r.office === "DEP_ESTADUAL") addSeat(c.party, `assembleia_${r.geo}`);
      if (r.office === "SENADOR") addSeat(c.party, "senado");
      if (r.office === "GOVERNADOR") addSeat(c.party, "governos");
    }
  }
  for (const r of snap.races.filter((r) => r.office === "GOVERNADOR" && r.round === 2)) {
    const w = r.candidates.find((c) => c.elected);
    if (w) addSeat(w.party, "governos");
  }
  for (const s of snap.senatorsContinuing) addSeat(s.party, "senado");
  for (const [uf, m] of Object.entries(snap.municipalCapitals)) {
    for (const [acr, n] of Object.entries(m.council)) addSeat(acr, `camara_mun_${uf}`, n);
    const mayor = capitalMayor(uf, m.mayor);
    if (mayor) addSeat(mayor.party, "prefeituras_capitais");
  }

  const partyByAcronym = new Map<string, PartyRow>();
  for (const sp of snap.parties) {
    const prof = profileFor(sp.acronym, Y);
    const fed = sp.federation ? fedByCode.get(sp.federation) : undefined;
    const seats = seatsByParty.get(sp.acronym) ?? {};
    const territory: Record<string, number> = {};
    for (const uf of UFS) {
      const race = findRace(snap, "DEP_FEDERAL", uf.code, 1);
      const total = race?.parties.reduce((s, p) => s + p.votes, 0) || 1;
      const votes = race?.parties.find((p) => p.number === sp.number)?.votes ?? 0;
      territory[uf.code] = Math.min(1, (votes / total) * 4);
    }
    const inCoalition = winnerCoalition.includes(sp.acronym);
    const spectrum = prof.ideology.economy * 0.45 + prof.ideology.social * 0.35 + prof.ideology.security * 0.2;
    const party: PartyRow = {
      id: partyIdFor(sp.number),
      world_id: world.id,
      name: sp.name,
      acronym: sp.acronym,
      number: sp.number,
      ideology: prof.ideology,
      entry_culture: prof.entry,
      reputation: 50,
      cash: 2_000_000 + (seats.camara ?? 0) * 900_000 + (seats.senado ?? 0) * 1_500_000,
      discipline: prof.discipline,
      color: prof.color,
      description: `${sp.name} (${sp.acronym}, nº ${sp.number}). Posição de jogo: ${spectrumLabel(prof.ideology)}.${fed ? ` Integra a ${titleFed(fed.name)}.` : ""}`,
      gov_alignment: inCoalition ? 1 : spectrum > OPPOSITION_SPECTRUM_THRESHOLD ? -1 : 0,
      president_id: null,
      territory,
      seats,
      members: Math.round(20_000 + (seats.camara ?? 0) * 25_000 + Object.values(territory).reduce((a, b) => a + b, 0) * 30_000),
      integrity: 0.5,
      federation: fed ? fed.code : null,
      federation_name: fed ? titleFed(fed.name) : null,
      is_fictional: false,
      status: "ATIVO",
      founder_id: null,
      founded_on: null,
      formation: null,
      fund_suspended_until: null,
      campaign_fund: null,
    };
    ctx.save("parties", party);
    partyByAcronym.set(sp.acronym, party);
    for (const ft of FACTION_TEMPLATES) {
      const faction: FactionRow = {
        id: `fac_${sp.number}_${ft.name.toLowerCase().replace(/\W+/g, "_")}`,
        world_id: world.id,
        party_id: party.id,
        name: ft.name,
        ideology: makeIdeology({
          economy: prof.ideology.economy + (ft.offset.economy ?? 0),
          social: prof.ideology.social + (ft.offset.social ?? 0),
          security: prof.ideology.security + (ft.offset.security ?? 0),
          institutions: prof.ideology.institutions + (ft.offset.institutions ?? 0),
          environment: prof.ideology.environment + (ft.offset.environment ?? 0),
          federalism: prof.ideology.federalism + (ft.offset.federalism ?? 0),
        }),
        strength: ft.strength,
        leader_id: null,
      };
      ctx.save("factions", faction);
    }
  }
  world.gov.base_party_ids = [...partyByAcronym.values()].filter((p) => p.gov_alignment === 1).map((p) => p.id);

  // ------------------------------------------------------- pessoas reais
  const people = new Map<string, PersonRow>();
  const keyOf = (name: string, uf: string) => `${normName(name)}|${uf}`;
  const realSource = snap.meta.result_source_id;
  const ufValid = (uf: string) => findRace(snap, "DEP_FEDERAL", uf, 1)?.valid || UF_BY_CODE[uf].electorate;

  const upsertReal = (c: { sq: string; name: string; party: string; birth_year: number | null }, uf: string, tier: number, recognition: Record<string, number>, reputation: number, sourceId: string) => {
    const key = keyOf(c.name, uf);
    const existing = people.get(key);
    const party = partyByAcronym.get(canon(c.party));
    if (existing) {
      existing.tier = Math.min(existing.tier, tier);
      existing.reputation = Math.max(existing.reputation, reputation);
      const st = state.t.person_states.get(existing.id)!;
      for (const [k, v] of Object.entries(recognition)) st.reach[k] = Math.max(st.reach[k] ?? 0, v);
      if (party && !existing.party_id) existing.party_id = party.id;
      return existing;
    }
    const pr = new Rng(`${opts.seed}|real|${c.sq}`);
    const { person, state: st } = buildPerson({
      id: `per_r_${c.sq}`,
      kind: "REAL_ACTIVE_AT_SNAPSHOT",
      name: c.name,
      birthYear: c.birth_year ?? 1970,
      uf,
      municipality: "",
      profession: "",
      origin: "real",
      partyId: party?.id ?? null,
      ideology: party ? jitter(party.ideology, pr, 6) : makeIdeology(),
      stage: "QUADRO",
      reputation,
      visibility: Math.round(Math.max(...Object.values(recognition), 0) * 100 * (tier === 1 ? 1 : 0.3)),
      traits: neutralRealTraits(pr),
      money: 0,
      reach: recognition,
      tier,
      externalRef: c.sq,
      sourceId,
      realPartyLabel: c.party,
      filiationDate: "2025-04-01",
      domicileSince: "2000-01-01",
      createdTick: 0,
      worldId: world.id,
    });
    people.set(key, person);
    ctx.save("persons", person);
    ctx.save("person_states", st);
    return person;
  };

  const nationalRecognition = (level: number) => Object.fromEntries(UFS.map((u) => [u.code, level]));

  // Presidência: candidatos, presidente eleito e quem exercia o cargo na data
  const presR2 = findRace(snap, "PRESIDENTE", "BR", 2);
  let presidentId: string | null = null;
  let electedId: string | null = null;
  for (const c of presR1?.candidates ?? []) {
    const top = (presR2?.candidates ?? []).some((x) => x.sq === c.sq) || c.elected;
    const level = top ? 0.98 : Math.min(0.8, 0.35 + c.share / 10);
    const p = upsertReal(c, homeUf(snap, c) ?? "DF", 1, nationalRecognition(level), Math.round(40 + Math.min(c.share, 55) * 0.6), realSource);
    p.visibility = Math.round(level * 100);
    if ((presR2 ?? presR1)?.candidates.find((x) => x.sq === c.sq)?.elected) electedId = p.id;
  }
  if (presR2) for (const c of presR2.candidates) if (c.elected) electedId = people.get(keyOf(c.name, homeUf(snap, c) ?? "DF"))?.id ?? electedId;
  const inc = snap.incumbentPresident;
  const incStart = `${Y - 3}-01-01`;
  const newTermStart = inaugurationDate("PRESIDENTE", Y);
  if (inc) {
    const sameAsElected = electedId && normName(state.t.persons.get(electedId)!.name) === normName(inc.name);
    const incPerson = sameAsElected ? state.t.persons.get(electedId!)! : upsertReal(inc, homeUfByName(snap, inc.name) ?? "DF", 1, nationalRecognition(0.97), 60, snap.meta.candidates_source_id);
    addMandate(ctx, incPerson, "PRESIDENTE", "BR", incStart, newTermStart, "ATIVO", null);
    if (inc.note) incPerson.status_note = inc.note;
    presidentId = incPerson.id;
  }
  if (electedId) {
    const p = state.t.persons.get(electedId)!;
    addMandate(ctx, p, "PRESIDENTE", "BR", newTermStart, termEnd("PRESIDENTE", Y), "FUTURO", `e${Y}`);
    p.tier = 1;
    presidentId ??= electedId;
  }
  world.gov.president_id = presidentId;

  // Governadores (vencedor final) e finalistas
  for (const uf of UFS) {
    const r1 = findRace(snap, "GOVERNADOR", uf.code, 1);
    const r2 = findRace(snap, "GOVERNADOR", uf.code, 2);
    const finalRace = r2 ?? r1;
    const contenders = (r2?.candidates ?? r1?.candidates.slice(0, 2) ?? []);
    for (const c of contenders) {
      const p = upsertReal(c, uf.code, 2, { [uf.code]: 0.92 }, Math.round(45 + c.share * 0.35), realSource);
      if (c.elected && finalRace) {
        addMandate(ctx, p, "GOVERNADOR", uf.code, inaugurationDate("GOVERNADOR", Y), termEnd("GOVERNADOR", Y), "FUTURO", `e${Y}`);
      }
    }
    for (const c of r1?.candidates.filter((c) => c.elected) ?? []) {
      const p = upsertReal(c, uf.code, 2, { [uf.code]: 0.92 }, Math.round(45 + c.share * 0.35), realSource);
      if (!r2) addMandate(ctx, p, "GOVERNADOR", uf.code, inaugurationDate("GOVERNADOR", Y), termEnd("GOVERNADOR", Y), "FUTURO", `e${Y}`);
    }
    // Senado
    const sen = findRace(snap, "SENADOR", uf.code, 1);
    for (const c of sen?.candidates.filter((c) => c.elected) ?? []) {
      const p = upsertReal(c, uf.code, 2, { [uf.code]: 0.8 }, Math.round(45 + c.share * 0.3), realSource);
      addMandate(ctx, p, "SENADOR", uf.code, inaugurationDate("SENADOR", Y), termEnd("SENADOR", Y), "FUTURO", `e${Y}`);
    }
    // Deputados
    for (const office of ["DEP_FEDERAL", "DEP_ESTADUAL"] as const) {
      const race = findRace(snap, office, uf.code, 1);
      for (const c of race?.candidates.filter((c) => c.elected) ?? []) {
        const recog = Math.min(0.85, 0.08 + Math.sqrt(c.votes / ufValid(uf.code)) * 1.4);
        const p = upsertReal(c, uf.code, office === "DEP_FEDERAL" ? 2 : 3, { [uf.code]: recog }, Math.round(38 + recog * 40), realSource);
        addMandate(ctx, p, office, uf.code, inaugurationDate(office, Y), termEnd(office, Y), "FUTURO", `e${Y}`);
      }
    }
  }
  // Senadores eleitos 4 anos antes (mandato em curso)
  for (const s of snap.senatorsContinuing) {
    const p = upsertReal(s, s.uf, 2, { [s.uf]: 0.75 }, 55, snap.meta.candidates_source_id);
    const becameGovernor = [...state.t.mandates.values()].some((m) => m.person_id === p.id && m.office_code === "GOVERNADOR");
    addMandate(ctx, p, "SENADOR", s.uf, `${Y - 3}-02-01`, becameGovernor ? inaugurationDate("GOVERNADOR", Y) : `${Y + 5}-02-01`, "ATIVO", null);
  }
  // Prefeitos das capitais (eleitos 2 anos antes)
  const ran2026 = new Set(
    snap.races.filter((r) => r.office === "GOVERNADOR" || r.office === "SENADOR" || r.round === 1).flatMap((r) => r.candidates.map((c) => keyOf(c.name, r.geo))),
  );
  for (const [uf, m] of Object.entries(snap.municipalCapitals)) {
    const mayor = capitalMayor(uf, m.mayor);
    if (!mayor) continue;
    const key = keyOf(mayor.name, uf);
    const leftToRun = ran2026.has(key);
    const p = upsertReal(mayor, uf, 2, { [uf]: 0.6 }, 55, snap.meta.candidates_source_id);
    p.municipality = capitalId(uf);
    addMandate(ctx, p, "PREFEITO", capitalId(uf), `${Y - 1}-01-01`, leftToRun ? `${Y}-04-04` : `${Y + 3}-01-01`, leftToRun ? "ENCERRADO" : "ATIVO", null);
  }
  // Cargo atual no registro da pessoa
  for (const m of state.t.mandates.values()) {
    if (m.status !== "ATIVO") continue;
    const p = state.t.persons.get(m.person_id)!;
    p.office_code = m.office_code;
    p.office_geo = m.geo;
    p.stage = "MANDATO";
  }

  // ------------------------------------------------------- quadros procedurais
  for (const party of partyByAcronym.values()) {
    const factions = [...state.t.factions.values()].filter((f) => f.party_id === party.id);
    for (const uf of UFS) {
      const strength = party.territory[uf.code];
      const hasSeat = (party.seats[`assembleia_${uf.code}`] ?? 0) > 0;
      if (strength < 0.08 && !hasSeat) continue;
      const cadre = spawnProceduralCadre(ctx, {
        partyId: party.id,
        uf: uf.code,
        ideology: party.ideology,
        roleLabel: `dirigente estadual do ${party.acronym}`,
        reputation: Math.round(35 + strength * 25),
        tier: 3,
      });
      const fac = rng.weighted(factions, (f) => f.strength);
      cadre.faction_id = fac.id;
      if (!fac.leader_id) fac.leader_id = cadre.id;
    }
  }
  for (const p of state.t.persons.values()) {
    if (p.party_id) {
      ctx.save("memberships", {
        id: `mem_${p.id}`,
        world_id: world.id,
        person_id: p.id,
        party_id: p.party_id,
        role: p.kind === "FICTIONAL_GENERATED" ? "DIRIGENTE" : "MEMBRO",
        joined_on: state.t.person_states.get(p.id)?.filiation_date ?? "2025-04-01",
        left_on: null,
        status: "ATIVA",
      });
    }
  }

  // ------------------------------------------------------- eleitorado
  const segRng = new Rng(`${opts.seed}|segments`);
  const generated = generateSegments(segRng);
  const segments: VoterSegmentRow[] = generated.map((g) => ({
    id: `seg_${g.uf}_${g.segment}`,
    world_id: world.id,
    uf: g.uf,
    segment: g.segment,
    weight: g.weight,
    ideology: g.ideology,
    turnout: g.turnout,
    econ_sensitivity: g.econ_sensitivity,
    mood: 0,
  }));
  calibrateSegments(segments, snap, partyByAcronym);
  for (const s of segments) ctx.save("voter_segments", s);

  // ------------------------------------------------------- eleições
  createSnapshotElection(ctx, snap, people, partyByAcronym);
  // força estadual inicial dos partidos: referência para as eleições municipais calculadas
  const startElection = state.t.elections.get(`e${Y}`)!;
  startElection.summary = { ...startElection.summary, territoryStart: snapshotTerritory(state.t.parties.values()) };
  for (const y of [Y + 2, Y + 4]) ctx.save("elections", scheduledElection(world.id, y));

  // ------------------------------------------------------- notícias de abertura
  const elected = electedId ? state.t.persons.get(electedId) : undefined;
  const finalRace = presR2 ?? presR1;
  const winner = finalRace?.candidates.find((c) => c.elected);
  const rival = finalRace?.candidates.find((c) => !c.elected);
  if (elected && winner && rival) {
    ctx.publish("SNAPSHOT_RESULT", {
      facts: {
        name: elected.name,
        year: Y,
        party: winner.party,
        votes: winner.votes.toLocaleString("pt-BR"),
        share: winner.share.toFixed(2).replace(".", ","),
        rival: rival.name,
        rivalVotes: rival.votes.toLocaleString("pt-BR"),
        rivalShare: rival.share.toFixed(2).replace(".", ","),
        source: "Tribunal Superior Eleitoral",
      },
      personIds: [elected.id, ...([people.get(keyOf(rival.name, homeUf(snap, rival) ?? "DF"))?.id].filter(Boolean) as string[])],
      sourceId: Y === 2026 ? "tse-noticia-reeleicao-2026" : realSource,
      factual: true,
      importance: 3,
    });
  }
  for (const uf of UFS) {
    const r2 = findRace(snap, "GOVERNADOR", uf.code, 2);
    const w = r2?.candidates.find((c) => c.elected);
    if (!w) continue;
    const p = people.get(keyOf(w.name, uf.code));
    if (!p) continue;
    ctx.publish("SNAPSHOT_GOVERNOR", {
      facts: { name: p.name, party: w.party, uf: uf.name, share: w.share.toFixed(2).replace(".", ","), votes: w.votes.toLocaleString("pt-BR") },
      personIds: [p.id],
      sourceId: realSource,
      factual: true,
      geography: uf.code,
    });
  }
  ctx.publish("WORLD_INTRO", { facts: { selic: economy.selic.toFixed(2).replace(".", ",") } });
  ctx.publish("WORLD_INTRO", { facts: { selic: economy.selic.toFixed(2).replace(".", ",") } });

  ctx.saveWorld();
  ctx.saveEconomy(economy);
  for (const table of STATEFUL_TABLES) for (const row of state.t[table].values()) ctx.changes.add(table, row as never);
  return { state, changes: ctx.changes };
}

/**
 * Alguns arquivos antigos do TSE não trazem a situação de totalização da disputa
 * presidencial/majoritária ("#NULO"). Nesses casos o eleito é derivado dos votos.
 */
export function normalizeElectedFlags(snap: Snapshot): void {
  for (const r of snap.races) {
    if (!["PRESIDENTE", "GOVERNADOR", "SENADOR"].includes(r.office)) continue;
    if (r.candidates.some((c) => c.elected)) continue;
    const sorted = [...r.candidates].sort((a, b) => b.votes - a.votes);
    if (r.office === "SENADOR") {
      const seats = senateSeatsForYear(snap.meta.year);
      sorted.slice(0, seats).forEach((c) => (c.elected = true));
      continue;
    }
    const hasRunoff = snap.races.some((x) => x.office === r.office && x.geo === r.geo && x.round === 2);
    if (r.round === 2 || (!hasRunoff && sorted[0] && sorted[0].share > 50)) {
      if (r.office === "PRESIDENTE" && r.geo !== "BR") {
        // o eleito por UF é o eleito nacional
        const br = snap.races.find((x) => x.office === "PRESIDENTE" && x.geo === "BR" && x.round === r.round);
        const nat = br ? [...br.candidates].sort((a, b) => b.votes - a.votes)[0] : undefined;
        r.candidates.forEach((c) => (c.elected = !!nat && c.sq === nat.sq));
      } else if (sorted[0]) sorted[0].elected = true;
    }
  }
}

function titleFed(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (_, s, c) => s + c.toUpperCase())
    .replace(/\bDa\b/g, "da")
    .replace(/\bDe\b/g, "de")
    .replace(/ - Fe Brasil/i, " (FE Brasil)");
}

function homeUf(snap: Snapshot, c: SnapshotCandidate): string | null {
  return homeUfByName(snap, c.name);
}

/** UF onde a pessoa tem outro registro no snapshot (para quem disputou a Presidência). */
function homeUfByName(snap: Snapshot, name: string): string | null {
  for (const r of snap.races) {
    if (r.office === "PRESIDENTE") continue;
    if (r.candidates.some((x) => normName(x.name) === normName(name))) return r.geo;
  }
  for (const s of snap.senatorsContinuing) if (normName(s.name) === normName(name)) return s.uf;
  return null;
}

function addMandate(ctx: Ctx, p: PersonRow, office: OfficeCode, geo: string, start: ISODate, end: ISODate, status: MandateRow["status"], electionId: string | null): void {
  const id = `man_${p.id}_${office}_${start}`;
  ctx.save("mandates", {
    id,
    world_id: ctx.world.id,
    person_id: p.id,
    office_code: office,
    geo,
    start_on: start,
    end_on: end,
    status,
    election_id: electionId,
    approval: 50,
  });
}

function initialEconomy(snap: Snapshot, worldId: string): EconomyRow {
  const e = snap.economy;
  return {
    id: `eco_${worldId}_${snap.meta.snapshot_date.slice(0, 7)}`,
    world_id: worldId,
    month: snap.meta.snapshot_date.slice(0, 7),
    gdp_growth: e.gdp_growth,
    gdp_level: e.gdp_level,
    inflation_12m: e.ipca_12m?.value ?? 4.6,
    inflation_month: e.ipca_month?.value ?? 0.4,
    unemployment: e.unemployment?.value ?? 5.4,
    selic: e.selic?.value ?? 13.75,
    debt_gdp: e.debt_gdp?.value ?? 82,
    primary_balance: -0.4,
    confidence: 50,
    fx: e.fx_usd?.value ?? 5.5,
    external_demand: 0,
    fiscal_impulse: 0.2,
    output_gap: 0.4,
    productivity: 0,
    supply_shock: 0,
    expectations: 4.2,
  };
}

/**
 * Calibra o eleitorado de cada UF para reproduzir o 2º turno presidencial real:
 * desloca os segmentos no plano economia/costumes/segurança até que dois
 * contendores com as posições de PT e PL obtenham as votações observadas.
 */
export function calibrateSegments(segments: VoterSegmentRow[], snap: Snapshot, parties: Map<string, PartyRow>): void {
  const pt = parties.get("PT");
  const pl = parties.get("PL");
  if (!pt || !pl) return;
  const base = (id: string, ideology: Ideology, align: number): Contender => ({
    id,
    ideology,
    reputation: 50,
    recognition: 1,
    partyStrength: 0,
    govAlignment: align,
    incumbent: false,
    momentum: 0,
    scandal: 0,
    noise: 0,
  });
  const contenders = [base("PT", pt.ideology, 1), base("PL", pl.ideology, -1)];
  for (const uf of UFS) {
    const r2 = findRace(snap, "PRESIDENTE", uf.code, 2);
    const target = r2?.candidates.find((c) => c.party === "PL")?.share;
    if (target === undefined) continue;
    const ufSegs = segments.filter((s) => s.uf === uf.code);
    const original = ufSegs.map((s) => ({ ...s.ideology }));
    const apply = (lean: number) => {
      ufSegs.forEach((s, i) => {
        s.ideology = {
          ...original[i],
          economy: clampAxis(original[i].economy + lean),
          social: clampAxis(original[i].social + lean),
          security: clampAxis(original[i].security + lean * 0.7),
        };
      });
    };
    let lo = -90;
    let hi = 90;
    for (let it = 0; it < 30; it++) {
      const mid = (lo + hi) / 2;
      apply(mid);
      const share = (ufShares(ufSegs, contenders, 50, 0).shares.get("PL") ?? 0) * 100;
      if (share < target) lo = mid;
      else hi = mid;
    }
    apply((lo + hi) / 2);
  }
}

export function scheduledElection(worldId: string, y: number): ElectionRow {
  const cal = electionCalendar(y);
  return {
    id: `e${y}`,
    world_id: worldId,
    year: y,
    kind: cal.kind,
    first_round: cal.firstRound,
    runoff: cal.runoff,
    calendar: {
      filiationDeadline: cal.filiationDeadline,
      partySwitchWindowStart: cal.partySwitchWindowStart,
      partySwitchWindowEnd: cal.partySwitchWindowEnd,
      conventionStart: cal.conventionStart,
      conventionEnd: cal.conventionEnd,
      registrationDeadline: cal.registrationDeadline,
      campaignStart: cal.campaignStart,
      preCampaignStart: cal.preCampaignStart,
    },
    status: "AGENDADA",
    summary: {},
  };
}

/** Registra a eleição real de 2026 (encerrada) com os resultados oficiais. */
function createSnapshotElection(ctx: Ctx, snap: Snapshot, people: Map<string, PersonRow>, parties: Map<string, PartyRow>): void {
  const Y = snap.meta.year;
  const el = scheduledElection(ctx.world.id, Y);
  el.status = "ENCERRADA";
  el.summary = { factual: true, source_id: snap.meta.result_source_id };
  ctx.save("elections", el);
  const keyOf = (name: string, uf: string) => `${normName(name)}|${uf}`;
  const findPerson = (c: SnapshotCandidate, geo: string): PersonRow | undefined =>
    people.get(keyOf(c.name, geo)) ?? [...people.values()].find((p) => normName(p.name) === normName(c.name) && (geo === "BR" || p.uf === geo));
  const toResults = (r: SnapshotRace | undefined) => {
    if (!r) return undefined;
    return {
      candidates: r.candidates
        .filter((c) => c.valid)
        .slice(0, 12)
        .map((c) => ({
          candidacy_id: `cand_${Y}_${c.sq}`,
          person_id: findPerson(c, r.geo)?.id ?? "",
          name: c.name,
          party_id: parties.get(c.party)?.id ?? "",
          votes: c.votes,
          share: c.share,
        })),
      turnout: r.turnout,
      invalid: r.blank + r.null_votes,
      valid: r.valid,
    };
  };
  const races: Array<[OfficeCode, string]> = [["PRESIDENTE", "BR"], ...UFS.flatMap((u) => [["GOVERNADOR", u.code] as [OfficeCode, string], ["SENADOR", u.code] as [OfficeCode, string]])];
  for (const [office, geo] of races) {
    const r1 = findRace(snap, office as SnapshotRace["office"], geo, 1);
    const r2 = findRace(snap, office as SnapshotRace["office"], geo, 2);
    if (!r1) continue;
    const final = r2 ?? r1;
    const race: RaceRow = {
      id: `e${Y}:${office}:${geo}`,
      world_id: ctx.world.id,
      election_id: el.id,
      office_code: office,
      geo,
      seats: office === "SENADOR" ? senateSeatsForYear(Y) : 1,
      electorate: r1.electorate,
      status: "ENCERRADA",
      results: {
        first: toResults(r1),
        runoff: r2 ? toResults(r2) : undefined,
        elected: final.candidates.filter((c) => c.elected).map((c) => findPerson(c, geo)?.id ?? c.name),
      },
      latest_poll: null,
    };
    ctx.save("races", race);
    for (const c of final.candidates.filter((c) => c.elected)) {
      const p = findPerson(c, geo);
      const party = parties.get(c.party);
      if (!p || !party) continue;
      const cand: CandidacyRow = {
        id: `cand_${Y}_${c.sq}`,
        world_id: ctx.world.id,
        election_id: el.id,
        race_id: race.id,
        person_id: p.id,
        party_id: party.id,
        office_code: office,
        geo,
        status: "ELEITO",
        is_player: false,
        ballot_number: c.party_number,
        campaign: { budget: 0, spent: 0, fefc: 0, donations: 0, volunteers: 0, team: {}, momentum: 0, debate_score: 0, proposals: [], rumor_damage: 0 },
        votes: c.votes,
        vote_share: c.share,
        note: "Resultado oficial (TSE)",
      };
      ctx.save("candidacies", cand);
    }
  }
}

export function regionOf(uf: string): Region {
  return UF_BY_CODE[uf].region;
}

export { addDays };
