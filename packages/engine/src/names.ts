import type { Rng } from "./rng";

/** Nomes procedurais. Combinações genéricas; nomes de figuras políticas reais são evitados pela moderação. */
const FIRST = [
  "Ana", "Beatriz", "Camila", "Daniela", "Eduarda", "Fernanda", "Gabriela", "Helena", "Isabela", "Joana",
  "Karina", "Larissa", "Mariana", "Natália", "Patrícia", "Raquel", "Sabrina", "Tatiana", "Vanessa", "Yasmin",
  "Adriana", "Bruna", "Cláudia", "Débora", "Elaine", "Flávia", "Glória", "Ingrid", "Jéssica", "Lívia",
  "André", "Bruno", "Carlos", "Diego", "Eduardo", "Fábio", "Gustavo", "Henrique", "Igor", "João",
  "Leonardo", "Marcelo", "Nelson", "Otávio", "Paulo", "Rafael", "Sérgio", "Thiago", "Vinícius", "Wagner",
  "Alexandre", "Caio", "Davi", "Emerson", "Felipe", "Hugo", "Júlio", "Lucas", "Mateus", "Rodrigo",
  "Antônia", "Cecília", "Francisca", "Luana", "Rosana", "Simone", "Valéria", "Zilda", "Benedito", "Raimundo",
];

const LAST = [
  "Almeida", "Barbosa", "Cardoso", "Castro", "Correia", "Costa", "Dias", "Duarte", "Farias", "Fernandes",
  "Freitas", "Gomes", "Lacerda", "Lima", "Lopes", "Macedo", "Martins", "Medeiros", "Melo", "Monteiro",
  "Moraes", "Moreira", "Nascimento", "Nogueira", "Oliveira", "Pereira", "Pinheiro", "Queiroz", "Ramos", "Rezende",
  "Ribeiro", "Rocha", "Sampaio", "Santana", "Siqueira", "Soares", "Tavares", "Teixeira", "Valente", "Vasconcelos",
  "Viana", "Xavier", "Aragão", "Bezerra", "Brandão", "Cavalcanti", "Coutinho", "Figueiredo", "Guimarães", "Holanda",
  "Leal", "Magalhães", "Matos", "Nunes", "Paiva", "Prado", "Rangel", "Sales", "Toledo", "Uchoa",
];

export function generateName(rng: Rng): string {
  const first = rng.pick(FIRST);
  const a = rng.pick(LAST);
  if (rng.chance(0.35)) {
    let b = rng.pick(LAST);
    if (b === a) b = rng.pick(LAST);
    return `${first} ${a} ${b}`;
  }
  return `${first} ${a}`;
}

export const PROFESSIONS = [
  { id: "professor", label: "professor(a)", income: 6500, competence: 0.08, charisma: 0.03 },
  { id: "advogado", label: "advogado(a)", income: 12000, competence: 0.1, charisma: 0.04 },
  { id: "medico", label: "médico(a)", income: 22000, competence: 0.1, charisma: 0.02 },
  { id: "empresario", label: "empresário(a)", income: 18000, competence: 0.06, charisma: 0.05 },
  { id: "sindicalista", label: "sindicalista", income: 5500, competence: 0.04, charisma: 0.1 },
  { id: "comunicador", label: "comunicador(a)", income: 9000, competence: 0.03, charisma: 0.12 },
  { id: "policial", label: "policial", income: 8000, competence: 0.05, charisma: 0.06 },
  { id: "agricultor", label: "produtor(a) rural", income: 10000, competence: 0.05, charisma: 0.05 },
  { id: "servidor", label: "servidor(a) público(a)", income: 9500, competence: 0.08, charisma: 0.02 },
  { id: "pastor", label: "líder religioso(a)", income: 6000, competence: 0.03, charisma: 0.12 },
  { id: "economista", label: "economista", income: 15000, competence: 0.12, charisma: 0.01 },
  { id: "estudante", label: "estudante", income: 1800, competence: 0.02, charisma: 0.06 },
  { id: "engenheiro", label: "engenheiro(a)", income: 14000, competence: 0.1, charisma: 0.02 },
  { id: "autonomo", label: "trabalhador(a) autônomo(a)", income: 3500, competence: 0.03, charisma: 0.07 },
] as const;

export type ProfessionId = (typeof PROFESSIONS)[number]["id"];

export function profession(id: string) {
  return PROFESSIONS.find((p) => p.id === id) ?? PROFESSIONS[PROFESSIONS.length - 1];
}

export const ORIGINS = [
  { id: "periferia", label: "periferia urbana", savings: 4000, assets: 15000, reach: 0.02 },
  { id: "classe_media", label: "classe média urbana", savings: 25000, assets: 280000, reach: 0.02 },
  { id: "interior", label: "interior do estado", savings: 12000, assets: 150000, reach: 0.03 },
  { id: "elite", label: "família tradicional da elite local", savings: 120000, assets: 1500000, reach: 0.05 },
  { id: "rural", label: "zona rural", savings: 8000, assets: 200000, reach: 0.02 },
] as const;

export function origin(id: string) {
  return ORIGINS.find((o) => o.id === id) ?? ORIGINS[1];
}
