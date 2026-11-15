const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  return `${dd} ${MONTHS[m - 1]} ${y}`;
}

export function fmtDateLong(d: string): string {
  const [y, m, dd] = d.slice(0, 10).split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, dd)).getUTCDay();
  return `${WEEKDAYS[wd]}, ${dd} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

/** "março de 2015" */
export function fmtMonthYear(d: string): string {
  const [y, m] = d.slice(0, 10).split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}

export const fmtMoney = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
export const fmtNum = (v: number) => Math.round(v).toLocaleString("pt-BR");
export const fmtPct = (v: number, d = 1) => `${v.toFixed(d).replace(".", ",")}%`;
export const fmtDec = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w))
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/** Dia de um instante no horário de Brasília, por extenso: "13 de dezembro de 2026" (assinatura). */
/** Hora de Brasília de um instante: "22h47". */
export function fmtHour(iso: string): string {
  const [h, m] = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)).split(":");
  return `${Number(h)}h${m}`;
}

export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}
