/**
 * Moderação básica de texto do usuário (nome de personagem, slogan, título de proposta).
 * O MVP não tem chat público; mesmo assim esses campos aparecem para outros jogadores.
 */

const BLOCKED_TERMS = [
  "porra", "caralho", "buceta", "cacete", "merda", "foder", "fodase", "puta", "puto", "viado",
  "bicha", "sapatao", "traveco", "macaco", "crioulo", "retardado", "mongoloide", "vagabunda",
  "arrombado", "cuzao", "corno", "piranha", "nazista", "hitler", "estupro", "estuprador",
  "pedofilo", "kkk", "fdp", "vsf", "tnc", "pqp",
];

/** Nomes de figuras políticas reais que personagens de jogadores não podem usar. */
const REAL_POLITICAL_NAMES = [
  "lula", "luiz inacio", "bolsonaro", "flavio bolsonaro", "jair bolsonaro", "eduardo bolsonaro",
  "michelle bolsonaro", "dilma", "dilma rousseff", "temer", "michel temer", "fernando henrique",
  "fhc", "collor", "sarney", "alckmin", "geraldo alckmin", "haddad", "fernando haddad", "tarcisio",
  "ciro gomes", "marina silva", "simone tebet", "moro", "sergio moro", "boulos", "guilherme boulos",
  "romeu zema", "ronaldo caiado", "ratinho junior", "eduardo leite",
  "arthur lira", "hugo motta", "alcolumbre", "pacheco", "rodrigo pacheco", "janja", "gleisi hoffmann",
  "flavio dino", "alexandre de moraes", "xandao", "nikolas ferreira", "damares", "marcal",
  "pablo marcal", "tabata amaral", "erika hilton", "kim kataguiri",
];

export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/3/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ModerationResult {
  ok: boolean;
  reason?: string;
}

export function moderateText(input: string, opts: { maxLength?: number; minLength?: number; extraRealNames?: string[]; checkRealNames?: boolean } = {}): ModerationResult {
  const max = opts.maxLength ?? 60;
  const min = opts.minLength ?? 2;
  const trimmed = input.trim();
  if (trimmed.length < min) return { ok: false, reason: `Mínimo de ${min} caracteres.` };
  if (trimmed.length > max) return { ok: false, reason: `Máximo de ${max} caracteres.` };
  if (/https?:|www\.|\.com\b|@\w/.test(trimmed.toLowerCase())) return { ok: false, reason: "Links e menções não são permitidos." };
  const norm = normalizeText(trimmed);
  const compact = norm.replace(/\s/g, "");
  const words = new Set(norm.split(" "));
  for (const term of BLOCKED_TERMS) {
    if (words.has(term) || (term.length >= 5 && compact.includes(term))) {
      return { ok: false, reason: "O texto contém termos não permitidos." };
    }
  }
  if (opts.checkRealNames === false) return { ok: true };
  const realNames = [...REAL_POLITICAL_NAMES, ...(opts.extraRealNames ?? []).map(normalizeText)];
  for (const name of realNames) {
    const pattern = new RegExp(`(^|\\s)${name}(\\s|$)`);
    if (pattern.test(norm)) {
      return { ok: false, reason: "Personagens não podem usar o nome de figuras políticas reais." };
    }
  }
  return { ok: true };
}
