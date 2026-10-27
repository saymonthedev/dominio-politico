import { addMonths, firstSunday, lastSunday, ymd, type ISODate } from "./calendar";

/**
 * Ruleset versionado. Legislação e regulamentação mudam; por isso nada disto
 * deve ficar "hardcoded para sempre" — o mundo guarda a versão que usa e a
 * tabela `rulesets` do banco pode sobrescrever qualquer campo.
 */
export type OfficeCode =
  | "VEREADOR"
  | "PREFEITO"
  | "DEP_ESTADUAL"
  | "DEP_FEDERAL"
  | "SENADOR"
  | "GOVERNADOR"
  | "PRESIDENTE";

export type ElectionKind = "MUNICIPAL" | "GERAL";

export interface OfficeRule {
  code: OfficeCode;
  name: string;
  /** feminino/neutro não é usado: o cargo aparece como substantivo */
  level: "MUNICIPAL" | "ESTADUAL" | "FEDERAL";
  system: "MAJORITARIO" | "PROPORCIONAL";
  election: ElectionKind;
  /** idade mínima (art. 14, §3º, VI da CF) */
  minAge: number;
  termYears: number;
  /** pode ter segundo turno */
  runoff: boolean;
  /** limite de reeleições consecutivas (null = sem limite) */
  consecutiveLimit: number | null;
  /** escopo geográfico da disputa */
  scope: "MUNICIPIO" | "UF" | "BR";
  /** ordem de "importância" para a carreira */
  rank: number;
}

export interface Ruleset {
  version: string;
  description: string;
  offices: Record<OfficeCode, OfficeRule>;
  /** meses mínimos de filiação antes da eleição */
  filiationMonths: number;
  /** meses mínimos de domicílio eleitoral antes da eleição */
  domicileMonths: number;
  /** anos de inelegibilidade após condenação por órgão colegiado (LC 64/90 com LC 135/2010) */
  ineligibilityYears: number;
  /** segundo turno municipal só acima deste eleitorado */
  municipalRunoffElectorate: number;
  /** limite de doação de pessoa física: fração do rendimento bruto do ano anterior */
  individualDonationShare: number;
  /** autofinanciamento: fração do teto de gastos */
  selfFundingShare: number;
  /** teto de gastos (R$) por eleitor, por cargo — valores de jogo, ajustados por ano */
  spendingCapPerVoter: Record<OfficeCode, number>;
  /** FEFC total (R$) da eleição de referência */
  fefcReference: number;
  /** idade mínima para criar personagem eleitor */
  minCharacterAge: number;
}

/**
 * Regras que mudam conforme o ano da eleição. Os pontos de partida vão de 2002 a 2026,
 * então cada mundo aplica a legislação vigente em cada pleito simulado.
 */
export interface EraRules {
  electionYear: number;
  filiationMonths: number;
  domicileMonths: number;
  /** LC 135/2010 (Ficha Limpa) aplicada a partir de 2012 */
  fichaLimpa: boolean;
  ineligibilityYears: number;
  /** doação de pessoa jurídica (vedada pelo STF na ADI 4650, a partir de 2016) */
  corporateDonations: boolean;
  /** Fundo Especial de Financiamento de Campanha (Lei 13.487/2017) */
  fefc: boolean;
  /** coligação em eleição proporcional (vedada pela EC 97/2017 a partir de 2020) */
  proportionalCoalitions: boolean;
  /** federações partidárias (Lei 14.208/2021) */
  federations: boolean;
  /** janela partidária (Lei 13.165/2015) */
  partySwitchWindow: boolean;
  /** fidelidade partidária (Res. TSE 22.610/2007): troca fora da janela pode custar o mandato */
  partyFidelity: boolean;
  conventionStart: [number, number];
  conventionEnd: [number, number];
  campaignStart: [number, number];
  /** posse em 1º/jan (até os eleitos em 2022) ou 5/6 jan (EC 111/2021) */
  newInaugurationDates: boolean;
  notes: string[];
}

export function eraRules(y: number): EraRules {
  const reform2015 = y >= 2016;
  const notes: string[] = [];
  if (y < 2012) notes.push("Antes da Lei da Ficha Limpa: inelegibilidade de 3 anos e só após trânsito em julgado.");
  if (y <= 2014) notes.push("Empresas ainda podem doar para campanhas.");
  if (y >= 2018) notes.push("Campanhas contam com o Fundo Especial de Financiamento de Campanha (FEFC).");
  if (y <= 2018) notes.push("Coligações são permitidas também nas eleições proporcionais.");
  if (y >= 2022) notes.push("Partidos podem formar federações.");
  if (y >= 2016) notes.push("Troca de partido sem perda de mandato só na janela partidária.");
  return {
    electionYear: y,
    filiationMonths: reform2015 ? 6 : 12,
    domicileMonths: y >= 2018 ? 6 : 12,
    fichaLimpa: y >= 2012,
    ineligibilityYears: y >= 2012 ? 8 : 3,
    corporateDonations: y <= 2014,
    fefc: y >= 2018,
    proportionalCoalitions: y <= 2018,
    federations: y >= 2022,
    partySwitchWindow: y >= 2016,
    partyFidelity: y >= 2008,
    conventionStart: reform2015 ? [7, 20] : [6, 10],
    conventionEnd: reform2015 ? [8, 5] : [6, 30],
    campaignStart: reform2015 ? [8, 16] : [7, 6],
    newInaugurationDates: y >= 2026,
    notes,
  };
}

export const OFFICES: Record<OfficeCode, OfficeRule> = {
  VEREADOR: { code: "VEREADOR", name: "Vereador(a)", level: "MUNICIPAL", system: "PROPORCIONAL", election: "MUNICIPAL", minAge: 18, termYears: 4, runoff: false, consecutiveLimit: null, scope: "MUNICIPIO", rank: 1 },
  PREFEITO: { code: "PREFEITO", name: "Prefeito(a)", level: "MUNICIPAL", system: "MAJORITARIO", election: "MUNICIPAL", minAge: 21, termYears: 4, runoff: true, consecutiveLimit: 1, scope: "MUNICIPIO", rank: 3 },
  DEP_ESTADUAL: { code: "DEP_ESTADUAL", name: "Deputado(a) estadual/distrital", level: "ESTADUAL", system: "PROPORCIONAL", election: "GERAL", minAge: 21, termYears: 4, runoff: false, consecutiveLimit: null, scope: "UF", rank: 2 },
  DEP_FEDERAL: { code: "DEP_FEDERAL", name: "Deputado(a) federal", level: "FEDERAL", system: "PROPORCIONAL", election: "GERAL", minAge: 21, termYears: 4, runoff: false, consecutiveLimit: null, scope: "UF", rank: 4 },
  SENADOR: { code: "SENADOR", name: "Senador(a)", level: "FEDERAL", system: "MAJORITARIO", election: "GERAL", minAge: 35, termYears: 8, runoff: false, consecutiveLimit: null, scope: "UF", rank: 5 },
  GOVERNADOR: { code: "GOVERNADOR", name: "Governador(a)", level: "ESTADUAL", system: "MAJORITARIO", election: "GERAL", minAge: 30, termYears: 4, runoff: true, consecutiveLimit: 1, scope: "UF", rank: 6 },
  PRESIDENTE: { code: "PRESIDENTE", name: "Presidente da República", level: "FEDERAL", system: "MAJORITARIO", election: "GERAL", minAge: 35, termYears: 4, runoff: true, consecutiveLimit: 1, scope: "BR", rank: 7 },
};

export const DEFAULT_RULESET: Ruleset = {
  version: "br-2026.1",
  description: "Regras de referência do snapshot de 26/10/2026 (CF/88, Lei 9.504/97, Lei 9.096/95, LC 64/90). Modelagem de jogo, não parecer jurídico.",
  offices: OFFICES,
  filiationMonths: 6,
  domicileMonths: 6,
  ineligibilityYears: 8,
  municipalRunoffElectorate: 200_000,
  individualDonationShare: 0.1,
  selfFundingShare: 0.1,
  spendingCapPerVoter: {
    VEREADOR: 0.35,
    PREFEITO: 2.2,
    DEP_ESTADUAL: 0.25,
    DEP_FEDERAL: 0.45,
    SENADOR: 0.6,
    GOVERNADOR: 1.4,
    PRESIDENTE: 0.9,
  },
  fefcReference: 4_960_000_000,
  minCharacterAge: 18,
};

export function mergeRuleset(base: Ruleset, override: Partial<Ruleset> | null | undefined): Ruleset {
  if (!override) return base;
  return { ...base, ...override, offices: { ...base.offices, ...(override.offices ?? {}) } };
}

export function electionKindForYear(y: number): ElectionKind | null {
  if (y % 2 !== 0) return null;
  return y % 4 === 2 ? "GERAL" : "MUNICIPAL";
}

/** Senado renova 1/3 e 2/3 alternadamente: 2026 (2 vagas), 2030 (1), 2034 (2)... */
export function senateSeatsForYear(y: number): number {
  return (y - 2026) % 8 === 0 ? 2 : 1;
}

export function officesForElection(kind: ElectionKind): OfficeCode[] {
  return (Object.keys(OFFICES) as OfficeCode[]).filter((c) => OFFICES[c].election === kind);
}

export interface ElectionCalendar {
  year: number;
  kind: ElectionKind;
  firstRound: ISODate;
  runoff: ISODate;
  filiationDeadline: ISODate;
  partySwitchWindowStart: ISODate;
  partySwitchWindowEnd: ISODate;
  conventionStart: ISODate;
  conventionEnd: ISODate;
  registrationDeadline: ISODate;
  campaignStart: ISODate;
  preCampaignStart: ISODate;
}

/** Calendário eleitoral derivado do ruleset (primeiro domingo de outubro / último domingo de outubro). */
export function electionCalendar(y: number): ElectionCalendar {
  const kind = electionKindForYear(y);
  if (!kind) throw new Error(`Não há eleição ordinária em ${y}`);
  const era = eraRules(y);
  const firstRound = firstSunday(y, 10);
  return {
    year: y,
    kind,
    firstRound,
    runoff: lastSunday(y, 10),
    filiationDeadline: addMonths(firstRound, -era.filiationMonths),
    partySwitchWindowStart: addMonths(firstRound, -7),
    partySwitchWindowEnd: addMonths(firstRound, -6),
    conventionStart: ymd(y, ...era.conventionStart),
    conventionEnd: ymd(y, ...era.conventionEnd),
    registrationDeadline: addMonths(ymd(y, ...era.conventionEnd), 0) > ymd(y, 8, 15) ? ymd(y, 8, 15) : ymd(y, era.conventionEnd[0], era.conventionEnd[1] + 5),
    campaignStart: ymd(y, ...era.campaignStart),
    preCampaignStart: ymd(y, 1, 1),
  };
}

/** Datas de posse. EC 111/2021: presidente em 5/jan e governadores em 6/jan a partir dos eleitos em 2026. */
export function inaugurationDate(office: OfficeCode, electionYear: number): ISODate {
  const y = electionYear + 1;
  const late = eraRules(electionYear).newInaugurationDates;
  switch (office) {
    case "PRESIDENTE":
      return ymd(y, 1, late ? 5 : 1);
    case "GOVERNADOR":
      return ymd(y, 1, late ? 6 : 1);
    case "PREFEITO":
    case "VEREADOR":
      return ymd(y, 1, 1);
    case "DEP_ESTADUAL":
    case "DEP_FEDERAL":
    case "SENADOR":
      return ymd(y, 2, 1);
  }
}

export function termEnd(office: OfficeCode, electionYear: number): ISODate {
  return inaugurationDate(office, electionYear + OFFICES[office].termYears);
}
