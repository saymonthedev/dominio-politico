import { addDays, weekday } from "../calendar";

/** Dia da semana por extenso, para textos. */
export const WEEKDAYS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function weekdayName(date: string): string {
  return WEEKDAYS[weekday(date)];
}

/** Próximo sábado (nunca hoje), para convites de fim de semana. */
export function nextSaturday(date: string): string {
  const wd = weekday(date);
  return addDays(date, (6 - wd + 7) % 7 || 7);
}
