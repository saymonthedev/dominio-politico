import { cache } from "react";
import { redirect } from "next/navigation";
import type { PartyRow, PersonRow, PersonStateRow, WorldRow, WorldState } from "@dp/engine";
import { supabaseServer } from "./supabase/server";
import { asPlayer, cachedState, isStartYear, modeOfWorld, worldIdFor, yearOfWorld, type WorldMode } from "./sim";

export type PublicWorld = Omit<WorldRow, "seed">;

export const getSession = cache(async () => {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  return { sb, user: data.user };
});

export const myCharacters = cache(async (): Promise<Array<{ world_id: string; person_id: string }>> => {
  const { sb, user } = await getSession();
  if (!user) return [];
  const { data } = await sb.rpc("my_characters");
  return (data as Array<{ world_id: string; person_id: string }>) ?? [];
});

/**
 * O mundo do jogador neste ponto de partida: o próprio (só dele ou fictício),
 * se tiver personagem em um; senão, o compartilhado.
 */
export const myWorldId = cache(async (year: number): Promise<string> => {
  const mine = (await myCharacters()).filter((c) => yearOfWorld(c.world_id) === year);
  return (mine.find((c) => modeOfWorld(c.world_id) !== "SHARED") ?? mine[0])?.world_id ?? worldIdFor(year);
});

export const myWorldMode = async (year: number): Promise<WorldMode> => modeOfWorld(await myWorldId(year));

export const getWorld = cache(async (year: number): Promise<PublicWorld | null> => {
  const { sb } = await getSession();
  const { data } = await sb.from("worlds").select("*").eq("id", await myWorldId(year)).maybeSingle();
  return (data as PublicWorld) ?? null;
});

export interface Me {
  year: number;
  worldId: string;
  person: PersonRow;
  state: PersonStateRow;
  party: PartyRow | null;
}

/** Personagem do usuário neste mundo; redireciona para a criação se não houver. */
export const requireMe = cache(async (year: number): Promise<Me> => {
  if (!isStartYear(year)) redirect("/jogo");
  const { sb, user } = await getSession();
  if (!user) redirect(`/entrar?next=/jogo/${year}`);
  const worldId = await myWorldId(year);
  const { data: st } = await sb.from("person_states").select("*").eq("world_id", worldId).eq("user_id", user.id).maybeSingle();
  if (!st) redirect(`/jogo/novo?ano=${year}`);
  const { data: person } = await sb.from("persons").select("*").eq("world_id", worldId).eq("id", st.id).maybeSingle();
  if (!person || person.status !== "ACTIVE") redirect(`/jogo/novo?ano=${year}`);
  let party: PartyRow | null = null;
  if (person.party_id) {
    const { data } = await sb.from("parties").select("*").eq("world_id", worldId).eq("id", person.party_id).maybeSingle();
    party = (data as PartyRow) ?? null;
  }
  return { year, worldId, person: person as PersonRow, state: st as PersonStateRow, party };
});

/**
 * Estado do mundo para as telas do jogador. Usa o cache só se ele bate com o
 * que acabou de ser lido do banco: o mesmo dia de jogo e o mesmo número de
 * ações do jogador. Assim, depois de agir, a tela já mostra o efeito.
 */
export const playerState = cache(async (year: number): Promise<WorldState> => {
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [world, session] = await Promise.all([getWorld(year), sb.auth.getSession()]);
  return asPlayer(session.data.session?.access_token, () => cachedState(me.worldId, { tick: world?.tick, personId: me.person.id, seq: me.state.action_seq }));
});

export const getParties = cache(async (worldId: string): Promise<PartyRow[]> => {
  const { sb } = await getSession();
  const { data } = await sb.from("parties").select("*").eq("world_id", worldId).order("number");
  return (data as PartyRow[]) ?? [];
});

export function partyMap(parties: PartyRow[]): Record<string, PartyRow> {
  return Object.fromEntries(parties.map((p) => [p.id, p]));
}
