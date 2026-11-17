import { cityName } from "./cities";
import { isMunicipality, ufOfMunicipality, UF_BY_CODE } from "./geo";
import { OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { PersonRow } from "./types";

/**
 * Parentesco na política (clã político, sugestão do jogador João Vitor): o jogador, os familiares
 * que ele lançou como candidatos e quem herdou a carreira formam uma família. Fica guardado na vida
 * dos jogadores (story.cla e story.family.politicos), então não precisa de tabela nova; este módulo
 * só lê e não depende das eleições (que o usam na elegibilidade).
 */

/** Cargos executivos: quem os ocupa torna os parentes inelegíveis no território (CF, art. 14, § 7º). */
const EXECUTIVE: readonly OfficeCode[] = ["PREFEITO", "GOVERNADOR", "PRESIDENTE"];

const INDEX = new WeakMap<Ctx, Map<string, string>>();

/** Família de cada pessoa na política: id → id do clã. Montado uma vez por contexto. */
function clanIndex(ctx: Ctx): Map<string, string> {
  let idx = INDEX.get(ctx);
  if (idx) return idx;
  idx = new Map();
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER") continue;
    const story = ctx.pstate(p.id)?.story;
    if (!story) continue;
    const clan = story.cla?.id ?? p.id;
    const politicos = story.family?.politicos ?? {};
    if (!story.cla && !Object.keys(politicos).length) continue;
    idx.set(p.id, clan);
    for (const id of Object.values(politicos)) idx.set(id, clan);
  }
  INDEX.set(ctx, idx);
  return idx;
}

/** Esquece o índice (alguém entrou na família agora). */
export function forgetClans(ctx: Ctx): void {
  INDEX.delete(ctx);
}

/** O clã da pessoa (o id do titular que começou a família na política), se ela é de um. */
export function clanOf(ctx: Ctx, personId: string): string | undefined {
  return clanIndex(ctx).get(personId);
}

/** Parentes na política (cônjuge, pais, filhos e irmãos lançados ou herdeiros), sem a própria pessoa. */
export function relativesOf(ctx: Ctx, personId: string): PersonRow[] {
  const idx = clanIndex(ctx);
  const clan = idx.get(personId);
  if (!clan) return [];
  const out: PersonRow[] = [];
  for (const [id, c] of idx) {
    if (c !== clan || id === personId) continue;
    const p = ctx.person(id);
    if (p) out.push(p);
  }
  return out;
}

/** O cargo executivo cobre a disputa? (o país, o estado ou as cidades dele, ou a própria cidade) */
export function within(executiveGeo: string, geo: string): boolean {
  if (executiveGeo === "BR") return true;
  if (executiveGeo === geo) return true;
  if (executiveGeo.length === 2) return geo === executiveGeo || (isMunicipality(geo) && ufOfMunicipality(geo) === executiveGeo);
  return false;
}

function where(ctx: Ctx, geo: string): string {
  if (geo === "BR") return "do país";
  if (geo.length === 2) return `de ${UF_BY_CODE[geo]?.name ?? geo}`;
  return `de ${cityName(ctx.s, geo) ?? "da cidade"}`;
}

/**
 * Inelegibilidade reflexa (Constituição, art. 14, § 7º): cônjuge e parentes até o segundo grau de
 * prefeito, governador ou presidente não disputam cargo no território de quem governa, a não ser que
 * já tenham mandato e tentem a reeleição. Devolve o motivo, ou null.
 */
export function reflexBlock(ctx: Ctx, person: PersonRow, office: OfficeCode, geo: string): string | null {
  const relatives = relativesOf(ctx, person.id);
  if (!relatives.length) return null;
  const reelection = person.office_code === office && person.office_geo === geo;
  if (reelection) return null;
  for (const r of relatives) {
    if (r.status !== "ACTIVE" || !r.office_code || !r.office_geo || !EXECUTIVE.includes(r.office_code)) continue;
    if (!within(r.office_geo, geo)) continue;
    return `Inelegível pela família: ${r.name} é ${OFFICES[r.office_code].name.toLowerCase()} ${where(ctx, r.office_geo)}, e parente de quem governa não disputa cargo nesse território (Constituição, art. 14, § 7º), a não ser a reeleição de quem já tem mandato.`;
  }
  return null;
}
