/** Datas do jogo são strings ISO 'YYYY-MM-DD' interpretadas em UTC. */
export type ISODate = string;

const DAY_MS = 86_400_000;

export function toDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function fromDate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, days: number): ISODate {
  return fromDate(new Date(toDate(d).getTime() + days * DAY_MS));
}

export function addMonths(d: ISODate, months: number): ISODate {
  const dt = toDate(d);
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + months;
  const day = dt.getUTCDate();
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromDate(target);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(a).getTime() - toDate(b).getTime()) / DAY_MS);
}

export function year(d: ISODate): number {
  return Number(d.slice(0, 4));
}

export function month(d: ISODate): number {
  return Number(d.slice(5, 7));
}

export function day(d: ISODate): number {
  return Number(d.slice(8, 10));
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function weekday(d: ISODate): number {
  return toDate(d).getUTCDay();
}

export function ymd(y: number, m: number, dd: number): ISODate {
  return fromDate(new Date(Date.UTC(y, m - 1, dd)));
}

/** Primeiro domingo de um mês. */
export function firstSunday(y: number, m: number): ISODate {
  const first = ymd(y, m, 1);
  const wd = weekday(first);
  return addDays(first, (7 - wd) % 7);
}

/** Último domingo de um mês. */
export function lastSunday(y: number, m: number): ISODate {
  const last = fromDate(new Date(Date.UTC(y, m, 0)));
  return addDays(last, -weekday(last));
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

export function isOnOrAfter(a: ISODate, b: ISODate): boolean {
  return a >= b;
}

export function ageAt(birthYear: number, at: ISODate): number {
  return year(at) - birthYear;
}

const MONTHS_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez",
];

export function formatDatePt(d: ISODate): string {
  return `${day(d)} ${MONTHS_PT[month(d) - 1]} ${year(d)}`;
}
