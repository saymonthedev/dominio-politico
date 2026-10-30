import { canonicalGeo } from "../../geo";
import { rngFor } from "../../rng";
import { OFFICES } from "../../ruleset";
import type { PartyRow, PersonRow } from "../../types";
import type { StoryCtx } from "../context";
import { brl } from "../def";
import { canAct, cityLabel, cityOf, findFigure, neighborhood, partyLeader, rel } from "../world";

export { brl };

/** Pessoa amarrada ao evento (só fictícios agem nas histórias). */
export function actor(c: StoryCtx, id: string | number | undefined): PersonRow | undefined {
  const p = id ? c.ctx.person(String(id)) : undefined;
  return canAct(p) ? p : undefined;
}

export function partyOf(c: StoryCtx, id: string | number | undefined): PartyRow | undefined {
  return id ? c.ctx.t.parties.get(String(id)) : undefined;
}

/** Bairro fictício estável para o personagem e um assunto. */
export function bairro(c: StoryCtx, key: string): string {
  return neighborhood(rngFor(c.ctx.world.seed, "bairro", 0, `${c.p.id}:${key}`));
}

/** O bairro onde o personagem mora. */
export function home(c: StoryCtx): string {
  return bairro(c, "casa");
}

export function city(c: StoryCtx): string {
  return cityLabel(c.ctx, c.p);
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/** "sábado, 14/03" */
export function dayLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${WEEKDAY[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function first(p: PersonRow | undefined): string {
  return p ? p.name.split(" ")[0] : "alguém";
}

/** "Fulano (papel)" ou só o nome. */
export function named(p: PersonRow | undefined): string {
  if (!p) return "alguém";
  return p.role_label ? `${p.name}, ${p.role_label},` : p.name;
}

export function officeLabel(p: PersonRow): string | null {
  return p.office_code ? OFFICES[p.office_code].name.toLowerCase() : null;
}

/** Partidos ativos com presença na UF, dos mais afins ao personagem para os menos. */
export function partiesNear(c: StoryCtx, opts: { exclude?: string | null; min?: number } = {}): PartyRow[] {
  return [...c.ctx.t.parties.values()]
    .filter((x) => x.status === "ATIVO" && x.id !== opts.exclude && !x.founder_id && (x.territory[c.p.uf] ?? 0) > (opts.min ?? 0.01))
    .sort((a, b) => c.affinity(b) - c.affinity(a) || (b.territory[c.p.uf] ?? 0) - (a.territory[c.p.uf] ?? 0));
}

/**
 * Político fictício da cidade (de preferência com o cargo pedido); se não
 * houver, a liderança local de um partido com presença no estado.
 */
export function localPolitician(c: StoryCtx, opts: { office?: string; partyId?: string | null; exclude?: string[] } = {}): PersonRow | undefined {
  const cityId = cityOf(c.p);
  const pool = [...c.ctx.t.persons.values()].filter(
    (x) => canAct(x) && x.uf === c.p.uf && !!x.party_id && !(opts.exclude ?? []).includes(x.id) && (!opts.partyId || x.party_id === opts.partyId),
  );
  const inCity = pool.filter((x) => canonicalGeo(x.municipality) === cityId);
  const withOffice = inCity.filter((x) => (opts.office ? x.office_code === opts.office : !!x.office_code));
  const list = withOffice.length ? withOffice : inCity;
  if (list.length) return c.rng.pick(list.sort((a, b) => a.id.localeCompare(b.id)));
  const party = opts.partyId ? c.ctx.t.parties.get(opts.partyId) : partiesNear(c)[0];
  if (!party) return undefined;
  return partyLeader(c.ctx, c.p, party);
}

/** Liderança comunitária recorrente de um bairro (a mesma pessoa volta nas histórias). */
export function communityLeader(c: StoryCtx, hood: string): PersonRow {
  return findFigure(c.ctx, c.p, `lideranca:${hood}`, `presidente da associação de moradores do ${hood}`, { age: [40, 68], reputation: 52 });
}

/** Relação do personagem com alguém. */
export function relWith(c: StoryCtx, id: string | number | undefined): number {
  return id ? rel(c.ctx, c.p.id, String(id)) : 0;
}

/** Contato fictício do personagem com relação mínima (o mais próximo). */
export function bestContact(c: StoryCtx, min = 25, filter: (p: PersonRow) => boolean = () => true): PersonRow | undefined {
  let best: PersonRow | undefined;
  let score = min - 1;
  for (const r of c.ctx.t.relationships.values()) {
    if (r.a_id !== c.p.id || r.score <= score) continue;
    const other = c.ctx.person(r.b_id);
    if (!canAct(other) || !filter(other)) continue;
    best = other;
    score = r.score;
  }
  return best;
}

/** Texto curto de um valor com sinal ("+3,2" / "−1,5"). */
export function signed(v: number, d = 1): string {
  const s = Math.abs(v).toFixed(d).replace(".", ",");
  return v >= 0 ? `+${s}` : `−${s}`;
}

export function pct(v: number): string {
  return `${v.toFixed(1).replace(".", ",")}%`;
}

/** Junta frases sem pontuação dobrada. */
export function join(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
