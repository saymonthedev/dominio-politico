"use server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/game";
import { reportError } from "@/lib/report-error";
import { DAILY_LIMIT, dropPhotos, MAX_PHOTOS, savePhoto } from "@/lib/suggestions";

export interface SendResult {
  ok: boolean;
  message: string;
}

/** Manda uma sugestão: confere o limite do dia, guarda as fotos e registra (a conta é a do login). */
export async function sendSuggestion(year: number, form: FormData): Promise<SendResult> {
  const { sb, user } = await getSession();
  if (!user) return { ok: false, message: "Sua sessão expirou. Entre de novo." };
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const author = String(form.get("author") ?? "").trim();
  if (title.length < 3 || title.length > 120) return { ok: false, message: "Dê um título de 3 a 120 letras." };
  if (body.length < 3 || body.length > 2000) return { ok: false, message: "Explique a ideia em até 2.000 letras." };
  if (!author || author.length > 60) return { ok: false, message: "Diga como você quer aparecer nos créditos (até 60 letras)." };
  const files = form.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_PHOTOS) return { ok: false, message: `No máximo ${MAX_PHOTOS} fotos por sugestão.` };

  // o limite do dia vem antes das fotos (sem guardar foto de sugestão que não vai entrar)
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await sb.from("suggestions").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since);
  if ((count ?? 0) >= DAILY_LIMIT) return { ok: false, message: `Você já mandou ${DAILY_LIMIT} sugestões hoje. Tente de novo amanhã.` };

  const paths: string[] = [];
  try {
    for (const f of files) paths.push(await savePhoto(user.id, f));
  } catch (e) {
    await dropPhotos(paths);
    const known = e instanceof Error && /^(Use fotos|Uma das fotos|Um dos arquivos)/.test(e.message);
    if (!known) await reportError("sugestao", "foto", e);
    return { ok: false, message: known ? (e as Error).message : "Não deu para guardar as fotos agora. Tente de novo." };
  }

  const { error } = await sb.rpc("suggestion_create", { p_title: title, p_body: body, p_author: author, p_images: paths, p_year: Number.isFinite(year) ? year : null });
  if (error) {
    await dropPhotos(paths);
    if (error.code === "P0001" || error.code === "42501") return { ok: false, message: error.message };
    await reportError("sugestao", "enviar", error);
    return { ok: false, message: "Não deu para enviar agora. Tente de novo em instantes." };
  }
  revalidatePath(`/jogo/${year}/sugestoes`);
  return { ok: true, message: "Sugestão enviada! Obrigado. Se ela entrar no jogo, todo mundo vai saber que a ideia foi sua." };
}
