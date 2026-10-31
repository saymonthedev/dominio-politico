import { addDays, diffDays, formatDatePt, weekday, type ISODate } from "./calendar";
import type { Rng } from "./rng";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { Injury, StoryState } from "./story/types";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Cansaço e corpo. O cansaço (0–100) sobe com o expediente, o mandato, a campanha e
 * cada ação que gasta energia; cai com o sono, os fins de semana e o que a pessoa faz
 * para descansar (academia, futebol, família, viagem, terapia). Muito cansaço devolve
 * menos energia por dia e desgasta a saúde. Esporte tem risco: tornozelo torcido,
 * mão ou perna quebrada, que tiram energia por semanas e travam algumas ações.
 */

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;

export function fatigueOf(st: PersonStateRow): number {
  return st.story?.fatigue ?? 25;
}

export function addFatigue(st: PersonStateRow, v: number): number {
  const s = storyOf(st);
  const before = s.fatigue ?? 25;
  s.fatigue = r1(clamp(before + v));
  return s.fatigue - before;
}

export function activeInjury(s: StoryState | null | undefined, date: ISODate): Injury | null {
  const i = s?.injury;
  return i && i.until > date ? i : null;
}

/** Lesões possíveis, com quanto tempo tiram e quanto da energia diária sobra. */
export const INJURIES: Record<string, { label: string; days: [number, number]; energy: number; legs?: boolean; health: number }> = {
  torcao: { label: "tornozelo torcido", days: [10, 18], energy: 0.85, legs: true, health: -2 },
  distensao: { label: "distensão muscular", days: [7, 14], energy: 0.9, health: -1 },
  joelho: { label: "lesão no joelho", days: [21, 35], energy: 0.8, legs: true, health: -3 },
  mao: { label: "mão quebrada", days: [28, 42], energy: 0.82, health: -3 },
  braco: { label: "braço quebrado", days: [35, 50], energy: 0.75, health: -4 },
  perna: { label: "perna quebrada", days: [50, 75], energy: 0.6, legs: true, health: -6 },
};

/** Marca a lesão no personagem e devolve o que aconteceu. */
export function injure(st: PersonStateRow, kind: keyof typeof INJURIES | string, date: ISODate, rng: Rng): Injury {
  const s = storyOf(st);
  const def = INJURIES[kind] ?? INJURIES.distensao;
  const days = rng.int(def.days[0], def.days[1]);
  const injury: Injury = { kind, label: def.label, since: date, until: addDays(date, days), energy: def.energy, legs: def.legs };
  s.injury = injury;
  s.health = r1(clamp(s.health + def.health));
  return injury;
}

/** Atividades físicas (bloqueadas com qualquer lesão) e ações que exigem andar muito (bloqueadas com lesão nas pernas). */
const SPORT = new Set(["academia", "jogar_bola", "pedalar", "caminhada"]);
const WALKING = new Set(["evento_local", "voluntariado", "militancia", "mobilizacao_regional", "caminhada_bairro", "corpo_a_corpo", "comicio", "panfletagem", "porta_a_porta", "mutirao_bairro", "campanha_filiacao"]);

export function injuryBlocks(st: PersonStateRow, date: ISODate, actionId: string): string | null {
  const i = activeInjury(st.story, date);
  if (!i) return null;
  if (SPORT.has(actionId)) return `Você está com ${i.label} até ${formatDatePt(i.until)}. Nada de esporte por enquanto.`;
  if (i.legs && WALKING.has(actionId)) return `Com ${i.label}, não dá para bater perna até ${formatDatePt(i.until)}.`;
  return null;
}

/** Energia que volta por dia: menos com muito cansaço, lesão ou sem casa. */
export function energyRecovery(st: PersonStateRow, date: ISODate): number {
  const s = st.story;
  const fatigue = s?.fatigue ?? 25;
  let f = 1 - Math.max(0, fatigue - 50) / 100;
  const inj = activeInjury(s, date);
  if (inj) f *= inj.energy;
  if (s?.home?.kind === "RUA") f *= 0.6;
  return Math.max(8, Math.round(25 * f));
}

/**
 * O dia do corpo: o cansaço do expediente e da política, o descanso do sono e do fim de
 * semana, a lesão que sara, a saúde que acompanha. Devolve true se for hora de um alerta
 * de esgotamento (o diretor de histórias cuida do acontecimento).
 */
export function dailyBody(ctx: Ctx, p: PersonRow, st: PersonStateRow, campaigning: boolean, prePhase: boolean): void {
  const s = storyOf(st, p, ctx.date);
  const jornada = typeof s.flags.jornada === "number" ? s.flags.jornada : 1;
  let up = 0;
  if (p.office_code) up += ["PREFEITO", "GOVERNADOR", "PRESIDENTE"].includes(p.office_code) ? 1.0 : 0.7;
  else up += 0.6 * jornada;
  if (campaigning) up += 1.2;
  else if (prePhase) up += 0.4;
  const home = s.home;
  if (home?.kind === "RUA") up += 2.5;
  else if (home?.tier === 0) up += 0.3;
  else if ((home?.tier ?? 1) >= 3) up -= 0.2;
  // sem carro numa cidade grande, o deslocamento cansa
  if (!s.car && (ctx.s.housing?.get(home?.city ?? "")?.households ?? 0) > 150_000) up += 0.3;
  const inj = activeInjury(s, ctx.date);
  if (inj) up += 0.2;
  let down = 1.1;
  const wd = weekday(ctx.date);
  if ((wd === 0 || wd === 6) && !campaigning) down += 1.2;
  const before = s.fatigue ?? 25;
  s.fatigue = r1(clamp(before + up - down));
  // a saúde acompanha: cansaço alto desgasta, descanso de verdade ajuda
  if (s.fatigue >= 80) s.health = r1(clamp(s.health - 0.12));
  else if (s.fatigue <= 25) s.health = r1(clamp(s.health + 0.03));
  if (home?.kind === "RUA") s.health = r1(clamp(s.health - 0.1));
  // lesão que acabou
  if (s.injury && s.injury.until <= ctx.date) {
    const label = s.injury.label;
    s.injury = null;
    ctx.notify(p.id, "Recuperado(a)", `A ${label} sarou. Liberado(a) para voltar ao ritmo de sempre.`, "/jogo/carreira");
  }
}

/** Texto curto do cansaço para a tela. */
export function fatigueLabel(v: number): string {
  if (v >= 85) return "esgotado(a)";
  if (v >= 65) return "muito cansado(a)";
  if (v >= 45) return "cansado(a)";
  if (v >= 25) return "bem";
  return "descansado(a)";
}

export function daysLeft(i: Injury, date: ISODate): number {
  return Math.max(0, diffDays(i.until, date));
}
