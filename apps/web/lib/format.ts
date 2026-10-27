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
