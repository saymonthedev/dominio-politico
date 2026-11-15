import { openUrna, urnasBetween, type ISODate, type Urna, type WorldState } from "@dp/engine";
import { avatarOf } from "./avatar";
import { photoOf } from "./photos";

/** Fotos (pessoas reais) e avatares (jogadores) na tela da urna. */
function withFaces(state: WorldState, u: Urna): Urna {
  const done = new Set<object>();
  for (const o of u.offices) {
    // as duas vagas do Senado dividem a mesma lista
    if (done.has(o.candidates)) continue;
    done.add(o.candidates);
    for (const c of o.candidates) {
      const p = state.t.persons.get(c.person);
      c.photo = photoOf(p)?.src ?? null;
      c.avatar = c.photo ? null : avatarOf(state, p);
    }
  }
  return u;
}

/** Urna aberta para o Painel (semana da votação), já com os rostos. */
export function openUrnaView(state: WorldState, personId: string, today: ISODate): Urna | null {
  const u = openUrna(state, personId, today);
  return u ? withFaces(state, u) : null;
}

/** Urnas dos dias de votação vividos no avanço do tempo (abrem antes da apuração). */
export function urnasView(state: WorldState, personId: string, from: ISODate, to: ISODate): Urna[] {
  return urnasBetween(state, personId, from, to).map((u) => withFaces(state, u));
}
