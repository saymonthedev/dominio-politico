"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCharacter, performAction, type ActionResult } from "@dp/engine";
import { getSession, myCharacters } from "@/lib/game";
import { asPlayer, clearPlayerWorlds, ensureWorld, fastForward, isStartYear, withWorld, worldIdFor, type FastForwardResult } from "@/lib/sim";

/** Token de acesso do jogador: as chamadas ao motor rodam no papel autenticado (mais tempo por comando no banco). */
async function tokenOf(sb: Awaited<ReturnType<typeof getSession>>["sb"]): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

export type ActionState = ActionResult & { at?: number };

const META = new Set(["__year", "__action"]);

export async function createCharacterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { sb, user } = await getSession();
  if (!user) redirect("/entrar");
  const year = Number(form.get("year"));
  if (!isStartYear(year)) return { ok: false, message: "Ponto de partida inválido." };
  try {
    const token = await tokenOf(sb);
    await asPlayer(token, () => ensureWorld(year));
    const ideology: Record<string, number> = {};
    for (const ax of ["economy", "social", "security", "institutions", "environment", "federalism"]) ideology[ax] = Number(form.get(`ax_${ax}`) ?? 0);
    const { result } = await asPlayer(token, () =>
      withWorld(worldIdFor(year), (state, mk) =>
        createCharacter(mk(`novo-${user.id}`), {
          userId: user.id,
          name: String(form.get("name") ?? ""),
          uf: String(form.get("uf") ?? ""),
          city: String(form.get("city") ?? "") || undefined,
          age: Number(form.get("age") ?? 0),
          profession: String(form.get("profession") ?? ""),
          origin: String(form.get("origin") ?? ""),
          interests: form.getAll("interests").map(String),
          ideology,
        }),
      ),
    );
    if (!result?.ok) return { ok: false, message: result?.error ?? "Não foi possível criar o personagem." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao criar o personagem." };
  }
  redirect(`/jogo/${year}`);
}

export async function doAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sessão expirada. Entre novamente." };
  const year = Number(form.get("__year"));
  const actionId = String(form.get("__action") ?? "");
  if (!isStartYear(year)) return { ok: false, message: "Mundo inválido." };
  const worldId = worldIdFor(year);
  const { data: st } = await sb.from("person_states").select("id").eq("world_id", worldId).eq("user_id", user.id).maybeSingle();
  if (!st) return { ok: false, message: "Você não tem personagem neste mundo." };
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (!META.has(k) && typeof v === "string" && v !== "") params[k] = v;
  try {
    const { result } = await asPlayer(await tokenOf(sb), () =>
      withWorld(worldId, (state, mk) => {
        if (state.t.persons.get(st.id)?.user_id !== user.id) return { ok: false, message: "Personagem não pertence a esta conta." };
        return performAction(mk(st.id), st.id, actionId, params);
      }),
    );
    revalidatePath(`/jogo/${year}`, "layout");
    return { ...(result ?? { ok: false, message: "Sem resultado." }), at: Date.now() };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao executar a ação.", at: Date.now() };
  }
}

/** Marca as notificações como lidas (ao abrir a página ou o sino). */
export async function markNotificationsRead(year: number): Promise<void> {
  const { sb, user } = await getSession();
  if (!user) return;
  await sb.rpc("mark_notifications_read", { p_ids: null });
  if (isStartYear(year)) revalidatePath(`/jogo/${year}`, "layout");
}

/** Atalho: executa uma ação do jogo com parâmetros já definidos (ex.: aceitar um convite). */
export async function quickAction(year: number, actionId: string, params: Record<string, string> = {}): Promise<ActionState> {
  const form = new FormData();
  form.set("__year", String(year));
  form.set("__action", actionId);
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  return doAction({ ok: true, message: "" }, form);
}

export async function deleteMyData(): Promise<void> {
  const { sb, user } = await getSession();
  // o motor limpa dossiês, achados, dinheiro não declarado, fundação e presidência de partido; o banco anonimiza o resto
  if (user) await clearPlayerWorlds(await myCharacters()).catch(() => undefined);
  await sb.rpc("delete_my_data");
  await sb.auth.signOut();
  redirect("/?conta=excluida");
}

export async function advanceTime(_: FastForwardResult | null, form: FormData): Promise<FastForwardResult> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sessão expirada.", days: 0 };
  const year = Number(form.get("__year"));
  const days = Number(form.get("days"));
  if (!isStartYear(year)) return { ok: false, message: "Mundo inválido.", days: 0 };
  try {
    const res = await asPlayer(await tokenOf(sb), () => fastForward(year, days, user.id));
    if (res.ok) revalidatePath(`/jogo/${year}`, "layout");
    return res;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao passar o tempo.", days: 0 };
  }
}
