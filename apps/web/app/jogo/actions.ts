"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createCharacter, performAction, type ActionResult, type WorldState } from "@dp/engine";
import { activePersonId, getSession, myActiveCharacters, myCharacters, myWorldId } from "@/lib/game";
import {
  advanceStep,
  asPlayer,
  careerEnd,
  clearPlayerWorlds,
  countPrivateWorlds,
  decideStory,
  dropWorld,
  ensureWorld,
  fastForward,
  isStartYear,
  logError,
  MAX_PRIVATE_WORLDS,
  modeOfWorld,
  WORLD_MODES,
  withWorld,
  worldExists,
  worldIdFor,
  yearOfWorld,
  type CareerEndView,
  type DecideResult,
  type FastForwardResult,
  type StepAdvanceResult,
  type WorldMode,
} from "@/lib/sim";

/** Token de acesso do jogador: as chamadas ao motor rodam no papel autenticado (mais tempo por comando no banco). */
async function tokenOf(sb: Awaited<ReturnType<typeof getSession>>["sb"]): Promise<string | null> {
  const { data } = await sb.auth.getSession();
  return data.session?.access_token ?? null;
}

/** O que mudou no personagem com a ação (para animar o resultado na tela). */
export interface ActionDelta {
  key: string;
  label: string;
  value: number;
  money?: boolean;
  /** subir é ruim (risco de escândalo, dívida, dinheiro sujo) */
  bad?: boolean;
}

export type ActionState = ActionResult & {
  at?: number;
  deltas?: ActionDelta[];
  /** nova etapa da carreira, se a ação fez o personagem subir (ou cair) */
  stage?: { from: string; to: string };
  /** novo partido (sigla) ou null ao sair, se a filiação mudou */
  party?: { from: string | null; to: string | null };
};

type Vitals = { stage: string; party: string | null; n: Record<string, number> };

/** Fotografia do personagem para medir o efeito de uma ação. */
function vitalsOf(state: WorldState, personId: string): Vitals | null {
  const p = state.t.persons.get(personId);
  const st = state.t.person_states.get(personId);
  if (!p || !st) return null;
  return {
    stage: p.stage,
    party: p.party_id ? state.t.parties.get(p.party_id)?.acronym ?? null : null,
    n: {
      energia: st.energy,
      caixa: st.money,
      reputacao: p.reputation,
      ativismo: st.activism,
      capital: st.political_capital,
      prestigio: st.party_standing,
      debate: st.debate_prep,
      escandalo: st.scandal,
      sujo: st.dirty_money,
      divida: st.debt,
    },
  };
}

const DELTA_META: Array<{ key: string; label: string; money?: boolean; bad?: boolean; min: number }> = [
  { key: "energia", label: "energia", min: 0.5 },
  { key: "caixa", label: "caixa", money: true, min: 1 },
  { key: "reputacao", label: "reputação", min: 0.1 },
  { key: "ativismo", label: "ativismo", min: 0.1 },
  { key: "capital", label: "capital político", min: 0.1 },
  { key: "prestigio", label: "prestígio no partido", min: 0.1 },
  { key: "debate", label: "preparo p/ debate", min: 0.1 },
  { key: "escandalo", label: "risco de escândalo", bad: true, min: 0.1 },
  { key: "sujo", label: "dinheiro não declarado", money: true, bad: true, min: 1 },
  { key: "divida", label: "dívida", money: true, bad: true, min: 1 },
];

function diffVitals(a: Vitals | null, b: Vitals | null): Pick<ActionState, "deltas" | "stage" | "party"> {
  if (!a || !b) return {};
  const deltas: ActionDelta[] = [];
  for (const m of DELTA_META) {
    const d = (b.n[m.key] ?? 0) - (a.n[m.key] ?? 0);
    if (Math.abs(d) >= m.min) deltas.push({ key: m.key, label: m.label, value: m.money ? Math.round(d) : Math.round(d * 10) / 10, money: m.money, bad: m.bad });
  }
  return {
    deltas,
    stage: a.stage !== b.stage ? { from: a.stage, to: b.stage } : undefined,
    party: a.party !== b.party ? { from: a.party, to: b.party } : undefined,
  };
}

const META = new Set(["__year", "__action"]);

export async function createCharacterAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { sb, user } = await getSession();
  if (!user) redirect("/entrar");
  const year = Number(form.get("year"));
  if (!isStartYear(year)) return { ok: false, message: "Ponto de partida inválido." };
  const mode = (WORLD_MODES as readonly string[]).includes(String(form.get("mode"))) ? (String(form.get("mode")) as WorldMode) : "SHARED";
  const chars = await myCharacters();
  if ((await myActiveCharacters()).some((c) => yearOfWorld(c.world_id) === year)) return { ok: false, message: "Você já tem um personagem neste ponto de partida." };
  const worldId = worldIdFor(year, mode, user.id);
  if (mode !== "SHARED") {
    // o mundo próprio de quem encerrou a carreira recebe o novo personagem
    if (chars.some((c) => modeOfWorld(c.world_id) !== "SHARED" && c.world_id !== worldId)) return { ok: false, message: "Cada conta pode ter um mundo próprio. Apague o personagem do outro mundo próprio para criar este." };
    if (!(await worldExists(worldId)) && (await countPrivateWorlds()) >= MAX_PRIVATE_WORLDS) return { ok: false, message: "As vagas para mundos próprios estão esgotadas no momento. Escolha o mundo compartilhado ou tente mais tarde." };
  }
  try {
    const token = await tokenOf(sb);
    await asPlayer(token, () => ensureWorld(year, worldId));
    const ideology: Record<string, number> = {};
    for (const ax of ["economy", "social", "security", "institutions", "environment", "federalism"]) ideology[ax] = Number(form.get(`ax_${ax}`) ?? 0);
    const { result } = await asPlayer(token, () =>
      withWorld(worldId, (state, mk) =>
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
    await logError("action", `criar personagem ${worldId}`, e);
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
  const worldId = await myWorldId(year);
  const pid = await activePersonId(worldId);
  if (!pid) return { ok: false, message: "Você não tem personagem ativo neste mundo." };
  const st = { id: pid };
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (!META.has(k) && typeof v === "string" && v !== "") params[k] = v;
  try {
    const { result } = await asPlayer(await tokenOf(sb), () =>
      withWorld(worldId, (state, mk) => {
        if (state.t.persons.get(st.id)?.user_id !== user.id) return { ok: false, message: "Personagem não pertence a esta conta." };
        const before = vitalsOf(state, st.id);
        const r = performAction(mk(st.id), st.id, actionId, params);
        return r.ok ? { ...r, ...diffVitals(before, vitalsOf(state, st.id)) } : r;
      }),
    );
    revalidatePath(`/jogo/${year}`, "layout");
    return { ...(result ?? { ok: false, message: "Sem resultado." }), at: Date.now() };
  } catch (e) {
    await logError("action", `${actionId} ${worldId}`, e);
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

/** Apaga um mundo próprio inteiro (com o personagem). Os compartilhados não podem ser apagados. */
export async function deleteMyWorld(form: FormData): Promise<void> {
  const { sb, user } = await getSession();
  if (!user) redirect("/entrar?next=/conta");
  const worldId = String(form.get("world") ?? "");
  const chars = await myCharacters();
  if (form.get("confirm") !== "on" || modeOfWorld(worldId) === "SHARED" || !chars.some((c) => c.world_id === worldId)) redirect("/conta?mundo=erro");
  await asPlayer(await tokenOf(sb), () => dropWorld(worldId));
  revalidatePath("/jogo");
  redirect("/conta?mundo=apagado");
}

export async function advanceTime(_: FastForwardResult | null, form: FormData): Promise<FastForwardResult> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sessão expirada.", days: 0 };
  const year = Number(form.get("__year"));
  const days = Number(form.get("days"));
  if (!isStartYear(year)) return { ok: false, message: "Mundo inválido.", days: 0 };
  try {
    const worldId = await myWorldId(year);
    const res = await asPlayer(await tokenOf(sb), () => fastForward(worldId, days, user.id));
    if (res.ok) revalidatePath(`/jogo/${year}`, "layout");
    return res;
  } catch (e) {
    await logError("action", `passar ${days} dias ${year}`, e);
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao passar o tempo.", days: 0 };
  }
}

/** Passa o tempo vivendo os dias (para nas decisões que seguram o relógio). */
export async function advanceDays(year: number, days: number): Promise<StepAdvanceResult> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sessão expirada.", days: 0 };
  if (!isStartYear(year)) return { ok: false, message: "Mundo inválido.", days: 0 };
  try {
    const worldId = await myWorldId(year);
    const res = await asPlayer(await tokenOf(sb), () => advanceStep(worldId, Math.round(days), user.id));
    if (res.ok) revalidatePath(`/jogo/${year}`, "layout");
    return res;
  } catch (e) {
    await logError("action", `viver ${days} dias ${year}`, e);
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao passar o tempo.", days: 0 };
  }
}

/** Responde a um acontecimento da carreira. */
export async function answerEvent(year: number, eventId: string, choiceId: string): Promise<DecideResult> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sessão expirada." };
  if (!isStartYear(year) || !eventId || !choiceId) return { ok: false, message: "Pedido inválido." };
  try {
    const worldId = await myWorldId(year);
    const res = await asPlayer(await tokenOf(sb), () => decideStory(worldId, user.id, eventId, choiceId));
    if (res.ok) revalidatePath(`/jogo/${year}`, "layout");
    return res;
  } catch (e) {
    await logError("action", `responder ${eventId} ${year}`, e);
    return { ok: false, message: e instanceof Error ? e.message : "Erro ao registrar a decisão." };
  }
}

/** Balanço da carreira que acabou de terminar neste mundo (para o pop-up final). */
export async function careerEndSummary(year: number, personId?: string): Promise<CareerEndView | null> {
  const { sb, user } = await getSession();
  if (!user || !isStartYear(year)) return null;
  const worldId = await myWorldId(year);
  const mine = (await myCharacters()).filter((c) => c.world_id === worldId).map((c) => c.person_id);
  const { data } = await sb.from("person_states").select("id, story").eq("world_id", worldId).eq("user_id", user.id);
  const ended = ((data ?? []) as Array<{ id: string; story: { ended?: { on: string } | null } | null }>)
    .filter((r) => r.story?.ended && mine.includes(r.id) && (!personId || r.id === personId))
    .sort((a, b) => (b.story!.ended!.on ?? "").localeCompare(a.story!.ended!.on ?? ""))[0];
  if (!ended) return null;
  return asPlayer(await tokenOf(sb), () => careerEnd(worldId, ended.id));
}
