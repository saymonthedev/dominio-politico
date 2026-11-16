import { formatDatePt, year } from "./calendar";
import { isJailed } from "./crime";
import { geoName, ufOfGeo } from "./elections";
import { UF_BY_CODE } from "./geo";
import { spawnProceduralCadre } from "./npc";
import { inaugurationDate, OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { ElectionRow, MandateRow, PersonRow } from "./types";

/**
 * Suplentes no Legislativo (sugestão do jogador Rian Andrade). A cadeira de quem sai antes do fim
 * do mandato (cassação, condenação, aposentadoria, morte ou outro cargo) passa ao suplente, como na
 * vida real. Antes, ninguém assumia: no mundo compartilhado, em 2050, o Ceará tinha 7 dos seus 22
 * deputados federais (14 eleitos em 2046 tinham sido condenados e um nem chegou a ser eleito).
 *
 * Nas casas proporcionais (Câmara, Assembleias e câmaras municipais), a vaga fica com o partido que a
 * conquistou na eleição: assume o jogador suplente mais votado do partido naquela disputa ou, sem ele,
 * o próximo nome da lista do partido (criado na hora). No Senado, assume o suplente escolhido na chapa
 * ou um nome do partido. Roda toda semana e nos dias de posse e, aos poucos, também enche as casas
 * que ficaram vazias.
 */

/** Casas legislativas com suplência, da mais alta para a mais baixa. */
export const SEATED_OFFICES: readonly OfficeCode[] = ["SENADOR", "DEP_FEDERAL", "DEP_ESTADUAL", "VEREADOR"];
const SEATED = new Set<string>(SEATED_OFFICES);
/** Prefixo do mandato de quem assumiu como suplente (vale até o fim da legislatura). */
const SUB = "msup_";
/** Cadeiras preenchidas por vez (toda semana): as casas que ficaram vazias antes desta versão enchem aos poucos. */
const PER_RUN = 300;
/** Dia e mês da posse de cada casa (ruleset.inaugurationDate; não muda com a época). */
const POSSE: Partial<Record<OfficeCode, string>> = Object.fromEntries(SEATED_OFFICES.map((o) => [o, inaugurationDate(o, 2030).slice(4)]));

type Seats = Record<string, number>;

/** Suplente guardado na eleição: jogador que não se elegeu (proporcionais) ou suplente da chapa (Senado). */
export interface StoredSuplente {
  id: string;
  party: string | null;
  votes?: number;
  /** Senado: de quem é suplente */
  of?: string;
}

/** Uma legislatura em curso: as cadeiras de uma casa que tomaram posse no mesmo dia. */
interface House {
  key: string;
  office: OfficeCode;
  geo: string;
  start: string;
  end: string;
  election?: ElectionRow;
  originals: MandateRow[];
  seated: MandateRow[];
}

/** Mandato de quem assumiu como suplente. */
export function isSubstitute(m: MandateRow): boolean {
  return m.id.startsWith(SUB);
}

/** Nome da casa para os avisos. */
export function houseName(office: OfficeCode, geo: string, cities?: Ctx["s"]["cities"]): string {
  if (office === "SENADOR") return "Senado Federal";
  if (office === "DEP_FEDERAL") return "Câmara dos Deputados";
  if (office === "DEP_ESTADUAL") return geo === "DF" ? "Câmara Legislativa do Distrito Federal" : `Assembleia Legislativa ${UF_BY_CODE[geo] ? `de ${UF_BY_CODE[geo].name}` : ""}`.trim();
  return `Câmara Municipal de ${geoName(geo, { cities })}`;
}

/** Cadeiras por partido na eleição: as contadas na apuração ou as guardadas aqui. */
function storedSeats(h: House): Seats | undefined {
  const s = h.election?.summary;
  return (s?.pendingSeats as Record<string, Seats> | undefined)?.[h.key] ?? (s?.listSeats as Record<string, Seats> | undefined)?.[h.key];
}

/** Partido mais forte no estado para a próxima cadeira (maiores médias, com a força territorial). */
function strongestParty(ctx: Ctx, uf: string, have: Seats | Map<string, number>): string | null {
  const count = (id: string) => (have instanceof Map ? have.get(id) : have[id]) ?? 0;
  let best: string | null = null;
  let bestQ = -1;
  for (const p of ctx.t.parties.values()) {
    if (p.status !== "ATIVO") continue;
    const q = (p.territory[uf] ?? 0) / (count(p.id) + 1);
    if (q > bestQ || (q === bestQ && best !== null && p.id < best)) {
      bestQ = q;
      best = p.id;
    }
  }
  return best;
}

/**
 * Cadeiras que cada partido conquistou. Sem registro (eleições de antes desta versão e o Senado),
 * vale o partido de quem foi eleito, quando a pessoa ainda está na memória; as cadeiras de quem já
 * saiu vão para os partidos mais fortes no estado. O resultado fica guardado na eleição.
 */
function seatsWanted(ctx: Ctx, h: House): Seats {
  const stored = storedSeats(h);
  if (stored) return stored;
  const seats: Seats = {};
  let unknown = 0;
  for (const m of h.originals) {
    const party = ctx.person(m.person_id)?.party_id;
    if (party) seats[party] = (seats[party] ?? 0) + 1;
    else unknown++;
  }
  for (let i = 0; i < unknown; i++) {
    const id = strongestParty(ctx, ufOfGeo(h.geo), seats);
    if (!id) break;
    seats[id] = (seats[id] ?? 0) + 1;
  }
  const e = h.election;
  if (e) {
    const all = (e.summary.listSeats as Record<string, Seats> | undefined) ?? {};
    all[h.key] = seats;
    e.summary.listSeats = all;
    ctx.save("elections", e);
  }
  return seats;
}

/** Mandatos em exercício da pessoa. */
function activeMandates(ctx: Ctx, personId: string): MandateRow[] {
  const out: MandateRow[] = [];
  for (const m of ctx.t.mandates.values()) if (m.person_id === personId && m.status === "ATIVO") out.push(m);
  return out;
}

/** Pode assumir a cadeira agora? (ativo, fora da casa, solto, elegível e sem cargo igual ou maior) */
function canTakeSeat(ctx: Ctx, p: PersonRow | undefined, h: House, inHouse: Set<string>): p is PersonRow {
  if (!p || p.status !== "ACTIVE" || inHouse.has(p.id)) return false;
  const st = ctx.pstate(p.id);
  if (isJailed(st, ctx.date) || (st?.ineligible_until && st.ineligible_until > ctx.date)) return false;
  const rank = OFFICES[h.office].rank;
  return !activeMandates(ctx, p.id).some((m) => OFFICES[m.office_code].rank >= rank);
}

/** Toma posse na cadeira até o fim da legislatura (quem tinha cargo menor deixa o outro). */
function takeSeat(ctx: Ctx, h: House, p: PersonRow, partyName: string): void {
  const left = activeMandates(ctx, p.id);
  for (const m of left) {
    m.status = "ENCERRADO";
    m.end_on = ctx.date;
    ctx.save("mandates", m);
  }
  ctx.save("mandates", {
    id: ctx.id("msup", p.id, h.office, h.geo),
    world_id: ctx.world.id,
    person_id: p.id,
    office_code: h.office,
    geo: h.geo,
    start_on: ctx.date,
    end_on: h.end,
    status: "ATIVO",
    election_id: h.election?.id ?? null,
    approval: 50,
  });
  p.office_code = h.office;
  p.office_geo = h.geo;
  if (p.stage !== "CANDIDATO" && p.stage !== "PRE_CANDIDATO") p.stage = "MANDATO";
  ctx.save("persons", p);
  if (p.kind !== "PLAYER") return;
  const office = OFFICES[h.office].name;
  const before = left.length ? ` Para assumir, você deixou o mandato de ${OFFICES[left[0].office_code].name.toLowerCase()}.` : "";
  ctx.notify(
    p.id,
    "Você assumiu a cadeira!",
    `A vaga aberta na ${houseName(h.office, h.geo, ctx.s.cities)} ficou com você, suplente do ${partyName}: você toma posse hoje como ${office} (${geoName(h.geo, ctx.s)}), com mandato até ${formatDatePt(h.end)}.${before}`,
    "/jogo/carreira",
  );
  ctx.publish("INAUGURATION", { facts: { name: p.name, office: office.toLowerCase(), geoName: geoName(h.geo, ctx.s), endDate: formatDatePt(h.end) }, personIds: [p.id], geography: ufOfGeo(h.geo) });
}

/** As legislaturas em curso, com as cadeiras de cada uma e quem está sentado nelas hoje. */
function housesInSession(ctx: Ctx): House[] {
  const byStart = new Map<string, House>();
  const byEnd = new Map<string, House>();
  const subs: MandateRow[] = [];
  for (const m of ctx.t.mandates.values()) {
    if (!SEATED.has(m.office_code)) continue;
    if (isSubstitute(m)) {
      if (m.status === "ATIVO") subs.push(m);
      continue;
    }
    // cadeira original: começou no dia da posse da legislatura (sempre 1º/01 ou 1º/02, em qualquer
    // época) e termina no mesmo dia, ao fim do mandato. Conta de texto: passa por milhares de mandatos.
    if (m.start_on > ctx.date || m.start_on.slice(4) !== POSSE[m.office_code]) continue;
    const end = `${year(m.start_on) + OFFICES[m.office_code].termYears}${m.start_on.slice(4)}`;
    if (end <= ctx.date) continue;
    const id = `${m.office_code}:${m.geo}|${m.start_on}`;
    let h = byStart.get(id);
    if (!h) {
      h = { key: `${m.office_code}:${m.geo}`, office: m.office_code, geo: m.geo, start: m.start_on, end, election: m.election_id ? ctx.t.elections.get(m.election_id) : undefined, originals: [], seated: [] };
      byStart.set(id, h);
      byEnd.set(`${m.office_code}:${m.geo}|${end}`, h);
    }
    h.originals.push(m);
    if (m.status === "ATIVO") h.seated.push(m);
  }
  for (const m of subs) byEnd.get(`${m.office_code}:${m.geo}|${m.end_on}`)?.seated.push(m);
  return [...byStart.values()].sort((a, b) => OFFICES[b.office].rank - OFFICES[a.office].rank || a.geo.localeCompare(b.geo) || a.start.localeCompare(b.start));
}

/** Preenche as cadeiras vagas do Legislativo com os suplentes. Devolve quantas foram preenchidas. */
export function fillVacancies(ctx: Ctx): number {
  // quem saiu da vida pública deixa a cadeira (a aposentadoria e a condenação sem cassação deixavam o mandato aberto)
  for (const m of ctx.t.mandates.values()) {
    if (m.status !== "ATIVO" || !SEATED.has(m.office_code) || ctx.person(m.person_id)?.status === "ACTIVE") continue;
    m.status = "ENCERRADO";
    if (m.end_on > ctx.date) m.end_on = ctx.date;
    ctx.save("mandates", m);
  }
  let budget = PER_RUN;
  let filled = 0;
  for (const h of housesInSession(ctx)) {
    if (budget <= 0) break;
    const wanted = storedSeats(h);
    const total = Math.max(h.originals.length, wanted ? Object.values(wanted).reduce((s, n) => s + n, 0) : 0);
    let vacant = total - h.seated.length;
    if (vacant <= 0) continue;
    const want = wanted ?? seatsWanted(ctx, h);
    const have = new Map<string, number>();
    const inHouse = new Set<string>();
    for (const m of h.seated) {
      const party = ctx.person(m.person_id)?.party_id ?? "";
      have.set(party, (have.get(party) ?? 0) + 1);
      inHouse.add(m.person_id);
    }
    const seat = (p: PersonRow, partyId: string) => {
      takeSeat(ctx, h, p, ctx.t.parties.get(partyId)?.acronym ?? "partido");
      have.set(p.party_id ?? "", (have.get(p.party_id ?? "") ?? 0) + 1);
      inHouse.add(p.id);
      vacant--;
      budget--;
      filled++;
    };
    const stored = ((h.election?.summary.suplentes as Record<string, StoredSuplente[]> | undefined)?.[h.key] ?? []).filter((s) => s.id);
    // Senado: assume o suplente da chapa de quem saiu (o 1º; se não puder, o 2º)
    if (h.office === "SENADOR") {
      for (const m of h.originals) {
        if (vacant <= 0 || budget <= 0) break;
        if (inHouse.has(m.person_id)) continue;
        const mine = stored.filter((s) => s.of === m.person_id);
        if (mine.some((s) => inHouse.has(s.id))) continue;
        const next = mine.map((s) => ctx.person(s.id)).find((p) => canTakeSeat(ctx, p, h, inHouse));
        if (next) seat(next, next.party_id ?? "");
      }
    }
    while (vacant > 0 && budget > 0) {
      // a vaga é do partido que conquistou a cadeira e hoje tem menos gente nela
      const short = Object.entries(want)
        .filter(([id]) => ctx.t.parties.get(id)?.status === "ATIVO")
        .map(([id, n]) => ({ id, n, gap: n - (have.get(id) ?? 0) }))
        .filter((x) => x.gap > 0)
        .sort((a, b) => b.gap - a.gap || b.n - a.n || a.id.localeCompare(b.id));
      const partyId = short[0]?.id ?? strongestParty(ctx, ufOfGeo(h.geo), have);
      const party = partyId ? ctx.t.parties.get(partyId) : undefined;
      if (!party) break;
      // o jogador suplente mais votado do partido nessa disputa; sem ele, o próximo nome da lista
      const player = h.office === "SENADOR" ? undefined : stored.filter((s) => s.party === party.id).map((s) => ctx.person(s.id)).find((p) => canTakeSeat(ctx, p, h, inHouse) && p.party_id === party.id);
      const uf = ufOfGeo(h.geo);
      const p =
        player ??
        spawnProceduralCadre(ctx, {
          partyId: party.id,
          uf,
          municipality: h.office === "VEREADOR" ? h.geo : undefined,
          ideology: party.ideology,
          roleLabel: `${OFFICES[h.office].name.toLowerCase()} do ${party.acronym}`,
          ageRange: [28, 62],
          reputation: 45,
          tier: h.office === "VEREADOR" || h.office === "DEP_ESTADUAL" ? 3 : 2,
        });
      if (!player) {
        const st = ctx.pstate(p.id);
        if (st) {
          st.reach[uf] = Math.max(st.reach[uf] ?? 0, h.office === "VEREADOR" ? 0.08 : 0.18);
          ctx.save("person_states", st);
        }
      }
      seat(p, party.id);
    }
  }
  return filled;
}
