import { UFS, type CityBase } from "./geo";
import { spectrumLabel } from "./ideology";
import { generateName } from "./names";
import { KNOWN_ACRONYMS, normAcronym, resolveAcronym } from "./parties";
import { Rng } from "./rng";
import type { Changes, WorldState } from "./state";
import type { PartyRow, PersonRow } from "./types";

/**
 * Modo "mundo fictício": o mesmo ponto de partida, com todas as pessoas e
 * partidos reais trocados por nomes inventados. Como ninguém ali é real, o
 * motor trata todos como personagens fictícios (inclusive para condutas
 * ilegais e investigações), e as fotos e logos reais não aparecem.
 *
 * A troca de nomes é determinística (semente do mundo + nome real), então os
 * dados estáticos dos municípios podem ser convertidos de novo a cada carga.
 */

/** Marcas do mundo em world.stats (só números cabem ali). */
export const PRIVATE_FLAG = "private";
export const FICTIONAL_FLAG = "fictional";
const ACR_PREFIX = "acr:";

export const isFictional = (s: Pick<WorldState, "world">) => !!s.world.stats?.[FICTIONAL_FLAG];
export const isPrivateWorld = (s: Pick<WorldState, "world">) => !!s.world.stats?.[PRIVATE_FLAG];

/** Nome inventado para uma pessoa real (sempre o mesmo no mesmo mundo). */
export function fictionalName(seed: string, real: string): string {
  const rng = new Rng(`${seed}|ficcao|${real}`);
  let name = generateName(rng);
  // nomes de três partes reduzem as coincidências entre milhares de pessoas
  if (name.split(" ").length < 3) {
    const extra = generateName(rng).split(" ").at(-1)!;
    if (!name.endsWith(extra)) name = `${name} ${extra}`;
  }
  return name;
}

const KINDS = ["Partido", "Movimento", "Aliança", "Frente", "Liga", "Coligação Popular", "Partido Social", "Partido Nacional"];
const CORES = [
  "da Aurora", "do Horizonte", "Terra e Trabalho", "da Nova Jornada", "Raiz Popular", "do Farol", "da Ponte", "Bandeira Verde",
  "Ordem e Futuro", "do Cerrado", "Mar Aberto", "da Colheita", "Ipê Amarelo", "Sertão Vivo", "do Alvorecer", "Ação Cívica",
  "da Travessia", "Pátria Comum", "do Equilíbrio", "Municipalista", "Rumo Certo", "da Bússola", "Chão Firme", "Vento Sul",
  "do Planalto Central", "Mãos Dadas", "da Lavoura", "Cidade Viva", "do Amanhã", "Força Serrana", "Rio Grande Livre", "Nova Fronteira",
];

const initials = (s: string) =>
  s
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["da", "do", "das", "dos", "e"].includes(w.toLowerCase()))
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Nomes e siglas inventados para os partidos, sem repetir nem coincidir com siglas reais. */
function inventParties(seed: string, parties: PartyRow[]): Map<string, { name: string; acronym: string }> {
  const rng = new Rng(`${seed}|ficcao|partidos`);
  const combos = rng.shuffle(KINDS.flatMap((k) => CORES.map((c) => `${k} ${c}`)));
  const used = new Set<string>();
  const out = new Map<string, { name: string; acronym: string }>();
  let i = 0;
  for (const p of [...parties].sort((a, b) => a.number - b.number)) {
    let name = combos[i++ % combos.length]!;
    let acr = initials(name);
    for (let n = 2; used.has(acr) || KNOWN_ACRONYMS.has(acr) || UF_CODES.has(acr) || acr.length < 2; n++) acr = `${initials(name)}${n}`;
    used.add(acr);
    if (out.size >= combos.length) name = `${name} ${p.number}`;
    out.set(p.id, { name, acronym: acr });
  }
  return out;
}

const UF_CODES = new Set(UFS.map((u) => u.code));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const SKIP_KEY = /(^id$|_id$|_ids$|^geo$|^uf$|^municipality$|^kind$|^status$|^office_code$|^seed$|_on$|^game_date$|_at$|^color$|^chamber$|^axis$)/;

/** Substitui os nomes reais em qualquer valor (textos, listas, objetos), sem mexer em ids e códigos. */
function makeRewriter(exact: Map<string, string>) {
  const keys = [...exact.keys()].filter((k) => k.length >= 2).sort((a, b) => b.length - a.length);
  const re = keys.length ? new RegExp(`(?<![\\p{L}\\d])(${keys.map(escape).join("|")})(?![\\p{L}\\d])`, "gu") : null;
  const text = (s: string): string => {
    const hit = exact.get(s);
    if (hit !== undefined) return hit;
    return re && s.length > 3 ? s.replace(re, (m) => exact.get(m) ?? m) : s;
  };
  const walk = (v: unknown, key = ""): unknown => {
    if (SKIP_KEY.test(key)) return v;
    if (typeof v === "string") return text(v);
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) o[exact.get(k) ?? k] = walk(x, k);
      return o;
    }
    return v;
  };
  return { text, walk };
}

/**
 * Converte um mundo recém-criado em fictício: pessoas e partidos ganham nomes
 * inventados e deixam de ser "reais"; textos já gravados são reescritos.
 * Guarda em world.stats o número de cada sigla real, para converter os municípios na carga.
 */
export function fictionalizeWorld(state: WorldState, changes: Changes): void {
  const seed = state.world.seed;
  const exact = new Map<string, string>();
  const parties = [...state.t.parties.values()];
  const invented = inventParties(seed, parties);
  for (const p of parties) {
    const f = invented.get(p.id)!;
    state.world.stats[`${ACR_PREFIX}${p.acronym}`] = p.number;
    exact.set(p.acronym, f.acronym);
    exact.set(p.name, f.name);
  }
  for (const p of parties) {
    if (p.federation_name) exact.set(p.federation_name, `Federação ${p.federation ? fedMembers(parties, p.federation, invented) : invented.get(p.id)!.acronym}`);
  }
  for (const p of state.t.persons.values()) {
    if (p.kind === "REAL_ACTIVE_AT_SNAPSHOT" || p.kind === "REAL_HISTORICAL") exact.set(p.name, fictionalName(seed, p.name));
  }
  const { walk } = makeRewriter(exact);
  for (const [table, rows] of changes.rows) {
    for (const [id, row] of rows) {
      const next = walk(row) as Record<string, unknown>;
      if (table === "persons") {
        const p = next as unknown as PersonRow;
        if (p.kind === "REAL_ACTIVE_AT_SNAPSHOT" || p.kind === "REAL_HISTORICAL") p.kind = "FICTIONAL_GENERATED";
        p.external_ref = null;
      }
      if (table === "parties") {
        const p = next as unknown as PartyRow;
        p.is_fictional = true;
        p.description = `${p.name} (${p.acronym}, nº ${p.number}). Partido fictício deste mundo. Posição de jogo: ${spectrumLabel(p.ideology)}.${p.federation_name ? ` Integra a ${p.federation_name}.` : ""}`;
      }
      if (table === "news_articles") (next as { factual?: boolean; source_id?: string | null }).factual = false;
      rows.set(id, next);
      const live = state.t[table as keyof typeof state.t] as Map<string, unknown> | undefined;
      if (live?.has(id)) live.set(id, next);
    }
  }
  state.world.stats[FICTIONAL_FLAG] = 1;
  state.world.name = `${state.world.name} (fictício)`;
  if (state.cities) state.cities = fictionalizeCities(state.cities, state);
}

function fedMembers(parties: PartyRow[], fed: string, invented: Map<string, { acronym: string }>): string {
  return parties
    .filter((p) => p.federation === fed)
    .map((p) => invented.get(p.id)!.acronym)
    .join("/");
}

/** Converte uma sigla real (de qualquer época) na sigla do partido correspondente no mundo fictício. */
export function acronymMapper(state: Pick<WorldState, "world" | "t">): (label: string) => string {
  const seed = state.world.seed;
  const byNumber = new Map<number, string>();
  const real = new Set<string>();
  for (const [k, n] of Object.entries(state.world.stats ?? {})) {
    if (!k.startsWith(ACR_PREFIX)) continue;
    real.add(k.slice(ACR_PREFIX.length));
    const party = state.t.parties.get(`pty_${n}`);
    if (party) byNumber.set(n, party.acronym);
  }
  const memo = new Map<string, string>();
  return (label: string): string => {
    if (!memo.has(label)) {
      const r = resolveAcronym(label, real);
      const n = r ? state.world.stats[`${ACR_PREFIX}${r}`] : undefined;
      const known = n !== undefined ? byNumber.get(n) : undefined;
      // sigla que não existe neste mundo: uma inventada, estável
      memo.set(label, known ?? `P${new Rng(`${seed}|sigla|${normAcronym(label)}`).int(10, 99)}`);
    }
    return memo.get(label)!;
  };
}

/** Converte os dados reais dos municípios (prefeitos, câmaras, votação) para os nomes do mundo fictício. */
export function fictionalizeCities(cities: Map<string, CityBase>, state: Pick<WorldState, "world" | "t">): Map<string, CityBase> {
  const seed = state.world.seed;
  const acr = acronymMapper(state);
  const out = new Map<string, CityBase>();
  for (const [id, c] of cities) {
    const mayor = c.mayor as (CityBase["mayor"] & { replaced?: { name: string; party: string; reason: string } }) | null;
    out.set(id, {
      ...c,
      mayor: mayor
        ? {
            ...mayor,
            sq: null,
            name: fictionalName(seed, mayor.name),
            party: acr(mayor.party),
            ...(mayor.replaced ? { replaced: { ...mayor.replaced, name: fictionalName(seed, mayor.replaced.name), party: acr(mayor.replaced.party) } } : {}),
          }
        : null,
      council: Object.fromEntries(Object.entries(c.council).map(([k, v]) => [acr(k), v])),
      president: Object.fromEntries(Object.entries(c.president).map(([k, v]) => [fictionalName(seed, k), v])),
    });
  }
  return out;
}
