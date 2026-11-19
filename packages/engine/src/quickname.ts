import { looksFemale } from "./gender";
import { generateName } from "./names";
import { moderateText, normalizeText } from "./news/moderation";
import type { Rng } from "./rng";

/**
 * "Criar rápido" (19/11): nomes prontos para o jogador novo, sorteados como os dos personagens do
 * jogo. Nenhum pode conter o nome de uma pessoa real do ponto de partida (a criação recusaria).
 */

/**
 * Todo texto nos campos "name" de um arquivo de dados (retrato do ponto de partida, municípios): inclui
 * os candidatos, eleitos e prefeitos que viram pessoas reais no mundo (e alguns nomes a mais, que só
 * tiram sugestões da lista).
 */
export function namesIn(data: unknown, out: string[] = []): string[] {
  if (Array.isArray(data)) for (const v of data) namesIn(v, out);
  else if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data)) {
      if (k === "name" && typeof v === "string") out.push(v);
      else if (v && typeof v === "object") namesIn(v, out);
    }
  }
  return out;
}

/**
 * Nomes reais como a criação de personagem confere: os que têm duas partes ou mais no original
 * (um espaço sobrando já conta, e o nome normalizado pode virar uma palavra só), normalizados.
 */
export function realNameSet(names: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const n of names) {
    if (n.split(" ").length < 2) continue;
    const norm = normalizeText(n);
    if (norm) out.add(norm);
  }
  return out;
}

/** Se o nome contém, palavra por palavra, algum nome real da lista (a mesma regra da moderação). */
export function containsRealName(name: string, real: ReadonlySet<string>): boolean {
  const words = normalizeText(name).split(" ");
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j <= words.length; j++) if (real.has(words.slice(i, j).join(" "))) return true;
  }
  return false;
}

/** Até `perGender` nomes de mulher e de homem, sem repetir, todos aceitos pela criação de personagem. */
export function quickNames(rng: Rng, real: ReadonlySet<string>, perGender = 8): { F: string[]; M: string[] } {
  const out = { F: [] as string[], M: [] as string[] };
  const seen = new Set<string>();
  for (let i = 0; i < perGender * 20 && (out.F.length < perGender || out.M.length < perGender); i++) {
    const name = generateName(rng);
    if (seen.has(name)) continue;
    seen.add(name);
    if (containsRealName(name, real) || !moderateText(name, { minLength: 3, maxLength: 40 }).ok) continue;
    const list = looksFemale(name) ? out.F : out.M;
    if (list.length < perGender) list.push(name);
  }
  return out;
}
