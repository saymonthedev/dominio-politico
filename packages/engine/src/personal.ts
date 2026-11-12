import { addDays, type ISODate } from "./calendar";
import { checkAchievements } from "./achievements";
import { usesRounds } from "./clock";
import type { Ctx, WorldState } from "./state";
import { storyDay } from "./story/director";
import { energyRecovery } from "./wellbeing";

/**
 * Dias pessoais no mundo compartilhado (rodadas): dentro da rodada o mundo fica parado e cada
 * jogador vive os próprios dias. A história dele, a energia, os prazos e as ações correm no dia
 * dele; o resto do país anda na virada da rodada.
 */
export interface PersonalDay {
  tick: number;
  date: ISODate;
}

/** Dia em que o jogador está: o dele, se já viveu dias à frente do mundo nesta rodada; senão, o do mundo. */
export function personalDay(state: WorldState, personId: string): PersonalDay {
  const w = state.world;
  const own = state.t.person_states.get(personId)?.story?.personal;
  return usesRounds(w) && own && own.tick > w.tick ? { tick: own.tick, date: own.date } : { tick: w.tick, date: w.game_date };
}

/**
 * Põe o relógio do mundo (só a data, mais nada) num dia e devolve como voltar. O motor lê a data
 * do mundo em toda parte: assim as ações, decisões e acontecimentos do jogador valem no dia dele.
 */
export function travelTo(state: WorldState, tick: number, date: ISODate): () => void {
  const w = state.world;
  const back = { tick: w.tick, date: w.game_date };
  w.tick = tick;
  w.game_date = date;
  return () => {
    w.tick = back.tick;
    w.game_date = back.date;
  };
}

/** Põe o mundo no dia do jogador (se ele está à frente) para uma ação ou decisão. null: já está. */
export function enterPersonalDay(state: WorldState, personId: string): (() => void) | null {
  const own = personalDay(state, personId);
  return own.tick === state.world.tick ? null : travelTo(state, own.tick, own.date);
}

/** O dia seguinte do jogador, vivido por ele (o mundo já está na data desse dia). */
export function livePlayerDay(ctx: Ctx, personId: string): void {
  const p = ctx.t.persons.get(personId);
  const st = ctx.pstate(personId);
  if (!p || !st || p.status !== "ACTIVE") return;
  const d = ctx.date;
  // muito cansaço, lesão ou falta de casa devolvem menos energia
  st.energy = Math.min(100, st.energy + energyRecovery(st, d));
  st.offers = st.offers.filter((o) => o.expires_tick > ctx.tick);
  if (st.jailed_until && st.jailed_until <= d) {
    st.jailed_until = null;
    ctx.notify(p.id, "Você deixou o regime fechado", "A pena progrediu de regime. Você volta a poder agir, mas a condenação continua na sua ficha.", "/jogo/investigacoes");
  }
  ctx.save("person_states", st);
  storyDay(ctx, p);
  checkAchievements(ctx, p);
}

/** Dia seguinte ao dia pessoal de agora. */
export const nextPersonalDay = (own: PersonalDay): PersonalDay => ({ tick: own.tick + 1, date: addDays(own.date, 1) });
