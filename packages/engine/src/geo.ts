/**
 * Geografia administrável do MVP: Brasil, regiões, 27 UFs e capitais.
 * Eleitorado por UF: oficial, TSE Resultados 2026 (1º turno presidencial).
 * Eleitorado das capitais: aproximação de calibração (o MVP não importa municípios).
 * Bancadas federais seguem a distribuição de 513 cadeiras vigente no snapshot.
 */
export type Region = "N" | "NE" | "CO" | "SE" | "S";

export interface UF {
  code: string;
  name: string;
  region: Region;
  capital: string;
  /** eleitorado aproximado, em eleitores */
  electorate: number;
  capitalElectorate: number;
  fedSeats: number;
  /** posição no mapa em grade (coluna, linha) */
  grid: [number, number];
}

export const REGION_NAMES: Record<Region, string> = {
  N: "Norte",
  NE: "Nordeste",
  CO: "Centro-Oeste",
  SE: "Sudeste",
  S: "Sul",
};

const M = 1_000_000;
const K = 1_000;

export const UFS: UF[] = [
  { code: "AC", name: "Acre", region: "N", capital: "Rio Branco", electorate: 613_742, capitalElectorate: 290 * K, fedSeats: 8, grid: [0, 2] },
  { code: "AL", name: "Alagoas", region: "NE", capital: "Maceió", electorate: 2_442_126, capitalElectorate: 650 * K, fedSeats: 9, grid: [6, 3] },
  { code: "AP", name: "Amapá", region: "N", capital: "Macapá", electorate: 576_988, capitalElectorate: 330 * K, fedSeats: 8, grid: [4, 0] },
  { code: "AM", name: "Amazonas", region: "N", capital: "Manaus", electorate: 2_798_611, capitalElectorate: 1500 * K, fedSeats: 8, grid: [1, 1] },
  { code: "BA", name: "Bahia", region: "NE", capital: "Salvador", electorate: 11_312_752, capitalElectorate: 1980 * K, fedSeats: 39, grid: [5, 3] },
  { code: "CE", name: "Ceará", region: "NE", capital: "Fortaleza", electorate: 6_996_545, capitalElectorate: 1810 * K, fedSeats: 22, grid: [5, 1] },
  { code: "DF", name: "Distrito Federal", region: "CO", capital: "Brasília", electorate: 2_258_320, capitalElectorate: 2200 * K, fedSeats: 8, grid: [4, 3] },
  { code: "ES", name: "Espírito Santo", region: "SE", capital: "Vitória", electorate: 2_991_650, capitalElectorate: 270 * K, fedSeats: 10, grid: [5, 4] },
  { code: "GO", name: "Goiás", region: "CO", capital: "Goiânia", electorate: 5_080_590, capitalElectorate: 1050 * K, fedSeats: 17, grid: [3, 3] },
  { code: "MA", name: "Maranhão", region: "NE", capital: "São Luís", electorate: 5_183_115, capitalElectorate: 740 * K, fedSeats: 18, grid: [4, 1] },
  { code: "MT", name: "Mato Grosso", region: "CO", capital: "Cuiabá", electorate: 2_637_801, capitalElectorate: 450 * K, fedSeats: 8, grid: [2, 2] },
  { code: "MS", name: "Mato Grosso do Sul", region: "CO", capital: "Campo Grande", electorate: 2_024_430, capitalElectorate: 640 * K, fedSeats: 8, grid: [2, 3] },
  { code: "MG", name: "Minas Gerais", region: "SE", capital: "Belo Horizonte", electorate: 16_372_372, capitalElectorate: 1950 * K, fedSeats: 53, grid: [4, 4] },
  { code: "PA", name: "Pará", region: "N", capital: "Belém", electorate: 6_262_397, capitalElectorate: 1050 * K, fedSeats: 17, grid: [3, 1] },
  { code: "PB", name: "Paraíba", region: "NE", capital: "João Pessoa", electorate: 3_248_531, capitalElectorate: 570 * K, fedSeats: 12, grid: [6, 2] },
  { code: "PR", name: "Paraná", region: "S", capital: "Curitiba", electorate: 8_613_657, capitalElectorate: 1350 * K, fedSeats: 30, grid: [2, 4] },
  { code: "PE", name: "Pernambuco", region: "NE", capital: "Recife", electorate: 7_223_450, capitalElectorate: 1230 * K, fedSeats: 25, grid: [5, 2] },
  { code: "PI", name: "Piauí", region: "NE", capital: "Teresina", electorate: 2_704_758, capitalElectorate: 640 * K, fedSeats: 10, grid: [4, 2] },
  { code: "RJ", name: "Rio de Janeiro", region: "SE", capital: "Rio de Janeiro", electorate: 12_857_648, capitalElectorate: 5000 * K, fedSeats: 46, grid: [4, 5] },
  { code: "RN", name: "Rio Grande do Norte", region: "NE", capital: "Natal", electorate: 2_659_825, capitalElectorate: 590 * K, fedSeats: 8, grid: [6, 1] },
  { code: "RS", name: "Rio Grande do Sul", region: "S", capital: "Porto Alegre", electorate: 8_522_545, capitalElectorate: 1090 * K, fedSeats: 31, grid: [2, 6] },
  { code: "RO", name: "Rondônia", region: "N", capital: "Porto Velho", electorate: 1_265_893, capitalElectorate: 340 * K, fedSeats: 8, grid: [1, 2] },
  { code: "RR", name: "Roraima", region: "N", capital: "Boa Vista", electorate: 401_521, capitalElectorate: 270 * K, fedSeats: 8, grid: [2, 0] },
  { code: "SC", name: "Santa Catarina", region: "S", capital: "Florianópolis", electorate: 5_734_651, capitalElectorate: 390 * K, fedSeats: 16, grid: [2, 5] },
  { code: "SP", name: "São Paulo", region: "SE", capital: "São Paulo", electorate: 34_122_892, capitalElectorate: 9320 * K, fedSeats: 70, grid: [3, 4] },
  { code: "SE", name: "Sergipe", region: "NE", capital: "Aracaju", electorate: 1_740_135, capitalElectorate: 470 * K, fedSeats: 8, grid: [6, 4] },
  { code: "TO", name: "Tocantins", region: "N", capital: "Palmas", electorate: 1_182_023, capitalElectorate: 220 * K, fedSeats: 8, grid: [3, 2] },
];

export const UF_BY_CODE: Record<string, UF> = Object.fromEntries(UFS.map((u) => [u.code, u]));

export const UF_CODES = UFS.map((u) => u.code);

export const NATIONAL_ELECTORATE = UFS.reduce((s, u) => s + u.electorate, 0);

export function getUF(code: string): UF {
  const uf = UF_BY_CODE[code];
  if (!uf) throw new Error(`UF desconhecida: ${code}`);
  return uf;
}

/** O DF não tem prefeito nem vereadores; elege deputados distritais. */
export function hasMunicipalElections(ufCode: string): boolean {
  return ufCode !== "DF";
}

export function municipalityId(ufCode: string): string {
  return `${ufCode}-CAP`;
}

/** Assembleias: art. 27 da Constituição (3x a bancada federal até 12; acima disso, 36 + excedente). */
export function stateSeats(ufCode: string): number {
  const fed = getUF(ufCode).fedSeats;
  return fed <= 12 ? fed * 3 : 36 + (fed - 12);
}

/** Câmaras municipais: faixas do art. 29, IV (aproximadas por eleitorado, já que o MVP não tem população). */
export function cityCouncilSeats(capitalElectorate: number): number {
  const pop = capitalElectorate * 1.35;
  const bands: Array<[number, number]> = [
    [15_000, 9], [30_000, 11], [50_000, 13], [80_000, 15], [120_000, 17], [160_000, 19],
    [300_000, 21], [450_000, 23], [600_000, 25], [750_000, 27], [900_000, 29], [1_050_000, 31],
    [1_200_000, 33], [1_350_000, 35], [1_500_000, 37], [1_800_000, 39], [2_400_000, 41],
    [3_000_000, 43], [4_000_000, 45], [5_000_000, 47], [6_000_000, 49], [7_000_000, 51], [8_000_000, 53],
  ];
  for (const [limit, seats] of bands) if (pop <= limit) return seats;
  return 55;
}
