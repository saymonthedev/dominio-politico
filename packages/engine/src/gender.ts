import { OFFICES, type OfficeCode } from "./ruleset";
import type { CareerStage, PersonRow } from "./types";

/**
 * Gênero do personagem (sugestão da jogadora Emyle Victorya): quem joga escolhe ser mulher ou homem
 * (ou não dizer) e os textos sobre ele passam do neutro "eleito(a)" para "eleita" ou "eleito".
 * Personagens fictícios do mundo seguem o primeiro nome. Pessoas reais ficam no neutro: o jogo
 * não deduz nada sobre elas.
 */
export type Gender = "F" | "M";

export const FEMALE_NAMES = ["Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Joana", "Karina", "Larissa", "Mariana", "Natália", "Patrícia", "Raquel", "Sabrina", "Tatiana", "Vanessa", "Yasmin", "Adriana", "Bruna", "Cláudia", "Débora", "Elaine", "Flávia", "Glória", "Lívia", "Antônia", "Cecília", "Francisca", "Luana", "Rosana", "Simone", "Valéria", "Zilda"];
export const MALE_NAMES = ["André", "Bruno", "Carlos", "Diego", "Eduardo", "Fábio", "Gustavo", "Henrique", "Igor", "João", "Leonardo", "Marcelo", "Nelson", "Otávio", "Paulo", "Rafael", "Sérgio", "Thiago", "Vinícius", "Wagner", "Alexandre", "Caio", "Davi", "Emerson", "Felipe", "Hugo", "Júlio", "Lucas", "Mateus", "Rodrigo", "Benedito", "Raimundo"];

/** Nomes femininos comuns que não terminam em "a" (e masculinos que terminam), para deduzir pelo nome. */
const FEMALE_EXTRA = new Set(
  "alice aline beatriz carmem carmen cristiane daniele danielle denise elaine eliane eloise emily emilly ester esther evelyn gabriele gabrielle heloise ingrid ines iris irene isabel isabele isabelle isis ivone jaqueline jacqueline jasmin kelly kemilly lais laís liz lis louise lourdes luiza maite michele michelle miriam nathaly nathalie nicole raquel rachel rose rosane ruth rute sueli suely solange tais thais taís thaís tatiane viviane yasmin yasmim yara"
    .split(" "),
);
const MALE_EXTRA = new Set("luca lucca joshua nicola juca zeca josua jonata".split(" "));
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mulher ou homem pelo primeiro nome (quando ninguém disse). */
export function looksFemale(name: string): boolean {
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (FEMALE_NAMES.includes(first)) return true;
  if (MALE_NAMES.includes(first)) return false;
  const n = plain(first);
  if (FEMALE_EXTRA.has(n)) return true;
  if (MALE_EXTRA.has(n)) return false;
  return n.endsWith("a");
}

export function isGender(v: unknown): v is Gender {
  return v === "F" || v === "M";
}

/**
 * O gênero com que o jogo fala da pessoa: o escolhido (jogadores e quem entrou na política pela
 * família); personagem fictício sem escolha, pelo primeiro nome; pessoa real, nenhum (neutro).
 */
export function genderOf(p: Pick<PersonRow, "kind" | "name"> & { gender?: Gender | null } | null | undefined): Gender | null {
  if (!p) return null;
  if (isGender(p.gender)) return p.gender;
  if (p.kind === "FICTIONAL_GENERATED") return looksFemale(p.name) ? "F" : "M";
  return null;
}

/**
 * Palavras escritas no neutro que quase sempre falam de outra pessoa (o filho, o aliado, o adversário,
 * quem vota) e os cargos e rótulos de políticos, que nos avisos e nas histórias costumam ser de outra
 * pessoa: ficam como estão, para não trocar o gênero de alguém pelo do jogador. O cargo e a etapa do
 * próprio jogador saem no gênero dele por officeTitle e stageTitle.
 */
const OTHERS = new Set([
  "jogador", "filho", "herdeiro", "adulto", "recém-nascido", "amigo", "aliado", "adversário", "vizinho", "sócio",
  "secretário", "assessor", "eleitor", "médico", "advogado", "renomado", "dele", "do", "único", "próximo", "irmão",
  "sucessor", "político", "vereador", "prefeito", "vice-prefeito", "deputado", "senador", "governador", "vice-governador",
]);

const lower = (s: string) => s.toLocaleLowerCase("pt-BR");
const isUpper = (s: string) => s === s.toLocaleUpperCase("pt-BR") && s !== lower(s);

/** "eleito(a)" → "eleita"/"eleito"; "vereador(a)" → "vereadora"; "cidadão(ã)" → "cidadã"; "um(a)" → "uma". */
function inflect(word: string, mark: string, g: Gender, all = false): string | null {
  if (!all && OTHERS.has(lower(word))) return null;
  const up = isUpper(word) || mark === "(A)";
  const fem = (s: string) => (up ? s.toLocaleUpperCase("pt-BR") : s);
  if (lower(mark) === "(ã)") {
    if (!/ão$/i.test(word)) return null;
    return g === "M" ? word : word.slice(0, -2) + fem("ã");
  }
  if (g === "M") return /(o|or|um)$/i.test(word) ? word : null;
  if (/o$/i.test(word)) return word.slice(0, -1) + fem("a");
  if (/or$/i.test(word)) return word + fem("a");
  if (/um$/i.test(word)) return word + fem("a");
  return null;
}

/**
 * O texto no gênero da pessoa de quem ele fala (o jogador, nas telas dele). Sem gênero, fica como está.
 * Só mexe nas formas neutras com parênteses; o resto do texto não muda.
 */
export function genderize(text: string, g: Gender | null | undefined): string;
export function genderize(text: string | undefined, g: Gender | null | undefined): string | undefined;
export function genderize(text: string | null | undefined, g: Gender | null | undefined): string | null | undefined;
export function genderize(text: string | null | undefined, g: Gender | null | undefined): string | null | undefined {
  if (!text || !g || !text.includes("(")) return text;
  return text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿ]+)*)(\((?:a|A|ã|Ã)\))/g, (all, word: string, mark: string) => inflect(word, mark, g) ?? all);
}

/**
 * Rótulo curto de uma pessoa ("jogador(a)", "filiado(a)", "político(a)") no gênero dela: aqui a palavra
 * fala sempre da própria pessoa, então nenhuma fica de fora.
 */
export function personWord(text: string, g: Gender | null | undefined): string {
  if (!g || !text.includes("(")) return text;
  return text.replace(/([A-Za-zÀ-ÖØ-öø-ÿ]+(?:-[A-Za-zÀ-ÖØ-öø-ÿ]+)*)(\((?:a|A|ã|Ã)\))/g, (m, word: string, mark: string) => inflect(word, mark, g, true) ?? m);
}

/** Nome do cargo no gênero da pessoa (sem gênero, o nome neutro de sempre). */
export function officeTitle(code: OfficeCode, g: Gender | null | undefined): string {
  return personWord(OFFICES[code].name, g);
}

export const STAGE_NAMES: Record<CareerStage, string> = {
  CIDADAO: "Cidadão(ã)",
  ATIVISTA: "Ativista",
  APROXIMACAO: "Aproximação partidária",
  FILIADO: "Filiado(a)",
  QUADRO: "Quadro partidário",
  PRE_CANDIDATO: "Pré-candidato(a)",
  CANDIDATO: "Candidato(a)",
  MANDATO: "Em mandato",
};

/** Etapa da carreira no gênero da pessoa. */
export function stageTitle(stage: string, g: Gender | null | undefined): string {
  const name = STAGE_NAMES[stage as CareerStage];
  return name ? personWord(name, g) : stage;
}

/** Um acontecimento na tela do jogador, no gênero dele (título, texto e escolhas). */
export function genderizeEvent<T extends { title: string; text: string; choices: Array<{ label: string; hint?: string; locked?: string | null; freed?: string }> }>(
  ev: T,
  g: Gender | null | undefined,
): T {
  if (!g) return ev;
  return {
    ...ev,
    title: genderize(ev.title, g),
    text: genderize(ev.text, g),
    choices: ev.choices.map((c) => ({ ...c, label: genderize(c.label, g), hint: genderize(c.hint, g), locked: genderize(c.locked, g), freed: genderize(c.freed, g) })),
  };
}

/** Um acontecimento já resolvido (histórico da carreira), no gênero do jogador. */
export function genderizeLog<T extends { title: string; outcome: string; choiceLabel?: string }>(e: T, g: Gender | null | undefined): T {
  if (!g) return e;
  return { ...e, title: genderize(e.title, g), outcome: genderize(e.outcome, g), choiceLabel: genderize(e.choiceLabel, g) };
}
