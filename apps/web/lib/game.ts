import { cache } from "react";
import { redirect } from "next/navigation";
import type { PartyRow, PersonRow, PersonStateRow, WorldRow, WorldState } from "@dp/engine";
import { currentUser } from "./supabase/server";
import { asPlayer, cachedState, isStartYear, modeOfWorld, worldIdFor, yearOfWorld, type WorldMode } from "./sim";

export type PublicWorld = Omit<WorldRow, "seed">;

/**
 * Sessão da requisição. O token é conferido aqui mesmo (assinatura ES256 do projeto, chaves em
 * cache), sem uma ida ao servidor de login a cada tela; a renovação do token continua automática.
 */
export const getSession = cache(currentUser);

export const myCharacters = cache(async (): Promise<Array<{ world_id: string; person_id: string }>> => {
  const { sb, user } = await getSession();
  if (!user) return [];
  const { data } = await sb.rpc("my_characters");
  return (data as Array<{ world_id: string; person_id: string }>) ?? [];
});

/** Personagens com a situação de cada um (a carreira pode ter acabado: morte ou aposentadoria). */
export const myCharacterStatus = cache(async (): Promise<Array<{ world_id: string; person_id: string; status: string }>> => {
  const chars = await myCharacters();
  if (!chars.length) return [];
  const { sb } = await getSession();
  // mundo e id juntos: a busca vai direto pela chave da tabela. Só pelo id, o banco passava pelas
  // ~150 mil pessoas de todos os mundos a cada tela (e conferia o acesso de cada uma)
  const { data } = await sb
    .from("persons")
    .select("id, world_id, status")
    .in("world_id", [...new Set(chars.map((c) => c.world_id))])
    .in("id", chars.map((c) => c.person_id));
  const rows = (data ?? []) as Array<{ id: string; world_id: string; status: string }>;
  return chars.map((c) => ({ ...c, status: rows.find((r) => r.id === c.person_id && r.world_id === c.world_id)?.status ?? "ACTIVE" }));
});

/** Personagens em atividade (um por ponto de partida). */
export const myActiveCharacters = cache(async () => (await myCharacterStatus()).filter((c) => c.status === "ACTIVE"));

/**
 * O mundo do jogador neste ponto de partida. Vale primeiro o personagem em atividade: quem encerrou
 * a carreira num mundo só seu e começou outra no compartilhado joga no novo (o antigo fica no
 * histórico). Entre mundos na mesma situação, o próprio (só dele ou fictício) vem antes do compartilhado.
 */
export const myWorldId = cache(async (year: number): Promise<string> => {
  const mine = (await myCharacterStatus()).filter((c) => yearOfWorld(c.world_id) === year);
  const pick = (list: typeof mine) => list.find((c) => modeOfWorld(c.world_id) !== "SHARED") ?? list[0];
  return (pick(mine.filter((c) => c.status === "ACTIVE")) ?? pick(mine))?.world_id ?? worldIdFor(year);
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

/** Personagem ativo do usuário num mundo (quem morreu ou se aposentou fica no histórico, ao lado do novo). */
export async function activePersonId(worldId: string): Promise<string | null> {
  const { sb, user } = await getSession();
  if (!user) return null;
  const { data: states } = await sb.from("person_states").select("id").eq("world_id", worldId).eq("user_id", user.id);
  const ids = ((states ?? []) as Array<{ id: string }>).map((s) => s.id);
  if (!ids.length) return null;
  const { data: persons } = await sb.from("persons").select("id, status").eq("world_id", worldId).in("id", ids);
  return ((persons ?? []) as Array<{ id: string; status: string }>).find((p) => p.status === "ACTIVE")?.id ?? null;
}

/** Personagem do usuário neste mundo; sem personagem ativo, vai para o balanço da carreira encerrada ou para a criação. */
export const requireMe = cache(async (year: number): Promise<Me> => {
  if (!isStartYear(year)) redirect("/jogo");
  const { sb, user } = await getSession();
  if (!user) redirect(`/entrar?next=/jogo/${year}`);
  const worldId = await myWorldId(year);
  const { data: states } = await sb.from("person_states").select("*").eq("world_id", worldId).eq("user_id", user.id);
  const rows = (states ?? []) as PersonStateRow[];
  if (!rows.length) redirect(`/jogo/novo?ano=${year}`);
  const { data: persons } = await sb.from("persons").select("*").eq("world_id", worldId).in("id", rows.map((r) => r.id));
  const person = ((persons ?? []) as PersonRow[]).find((p) => p.status === "ACTIVE");
  if (!person) redirect(rows.some((r) => r.story?.ended) ? `/jogo/fim/${year}` : `/jogo/novo?ano=${year}`);
  const st = rows.find((r) => r.id === person.id)!;
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
  const load = asPlayer(session.data.session?.access_token, () => cachedState(me.worldId, { tick: world?.tick, personId: me.person.id, seq: me.state.action_seq }));
  // banco num pico: melhor a tela tentar de novo sozinha (a carga segue e fica na memória) do que
  // estourar o limite de 60 s da função e cair na página de erro da hospedagem
  return withDeadline(load, STATE_DEADLINE_MS, "O mundo demorou para carregar. Tentando de novo…");
});

/** Tempo máximo para a tela esperar o mundo (o resto da função ainda precisa de folga). */
const STATE_DEADLINE_MS = 25_000;

function withDeadline<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

export const getParties = cache(async (worldId: string): Promise<PartyRow[]> => {
  const { sb } = await getSession();
  const { data } = await sb.from("parties").select("*").eq("world_id", worldId).order("number");
  return (data as PartyRow[]) ?? [];
});

export function partyMap(parties: PartyRow[]): Record<string, PartyRow> {
  return Object.fromEntries(parties.map((p) => [p.id, p]));
}
