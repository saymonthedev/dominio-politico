import { del, get, list, put } from "@vercel/blob";
import { createClient } from "@supabase/supabase-js";
import { simSecret, SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Sugestões dos jogadores. As fotos ficam na loja privada do Vercel Blob (pasta sugestoes/<conta>/),
 * e só a própria conta e o admin conseguem abrir (pela rota /api/sugestao-foto). Só no servidor.
 */

export const MAX_PHOTOS = 3;
/** a tela já reduz as fotos antes de mandar; isto é só o teto */
export const MAX_PHOTO_BYTES = 3_000_000;
export const DAILY_LIMIT = 5;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const PHOTO_PATH = /^sugestoes\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

export type SuggestionStatus = "NOVA" | "CONCLUIDA" | "REPROVADA";

export interface MySuggestion {
  id: string;
  title: string;
  body: string;
  images: string[];
  status: SuggestionStatus;
  admin_note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface AdminSuggestion extends MySuggestion {
  user_id: string;
  email: string | null;
  author_name: string;
  world_year: number | null;
}

export interface PopupItem {
  id: string;
  title: string;
  note: string | null;
  author?: string;
  at: string;
}

export interface SuggestionPopups {
  news: PopupItem[];
  mine: PopupItem[];
}

/** Confere a assinatura do arquivo (não só o tipo que o navegador informou). */
function looksLike(b: Buffer, ext: string): boolean {
  if (ext === "jpg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (ext === "webp") return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  return false;
}

/** Guarda uma foto da sugestão na pasta da conta e devolve o caminho. */
export async function savePhoto(userId: string, file: File): Promise<string> {
  const ext = EXT[file.type];
  if (!ext) throw new Error("Use fotos em JPG, PNG ou WebP.");
  if (file.size > MAX_PHOTO_BYTES) throw new Error("Uma das fotos é grande demais (máximo 3 MB).");
  const buf = Buffer.from(await file.arrayBuffer());
  if (!looksLike(buf, ext)) throw new Error("Um dos arquivos não é uma imagem.");
  const path = `sugestoes/${userId}/${crypto.randomUUID()}.${ext}`;
  await put(path, buf, { access: "private", addRandomSuffix: false, contentType: file.type, abortSignal: AbortSignal.timeout(20_000) });
  return path;
}

export async function dropPhotos(paths: string[]): Promise<void> {
  await Promise.all(paths.map((p) => del(p, { abortSignal: AbortSignal.timeout(8_000) }).catch(() => undefined)));
}

/** Exclusão de conta: as fotos das sugestões saem junto (as sugestões saem pelo banco). */
export async function dropUserPhotos(userId: string): Promise<void> {
  const { blobs } = await list({ prefix: `sugestoes/${userId}/`, limit: 1000, abortSignal: AbortSignal.timeout(8_000) });
  if (blobs.length) await del(blobs.map((b) => b.url), { abortSignal: AbortSignal.timeout(8_000) });
}

/** Uma foto guardada (null: não existe ou a loja não respondeu). */
export async function readPhoto(path: string): Promise<{ stream: ReadableStream<Uint8Array>; type: string } | null> {
  const res = await get(path, { access: "private", abortSignal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return { stream: res.stream, type: res.blob.contentType || "image/jpeg" };
}

const anon = () => createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

/** /admin: todas as sugestões, as novas primeiro. */
export async function adminSuggestions(): Promise<AdminSuggestion[]> {
  const { data, error } = await anon().rpc("suggestions_admin", { p_secret: simSecret() });
  if (error) throw new Error(`suggestions_admin: ${error.message}`);
  return (data ?? []) as AdminSuggestion[];
}

/** /admin: concluída, reprovada ou de volta para nova, com a nota que o jogador vai ler. */
export async function decideSuggestion(id: string, status: SuggestionStatus, note: string): Promise<void> {
  const { error } = await anon().rpc("suggestion_decide", { p_secret: simSecret(), p_id: id, p_status: status, p_note: note });
  if (error) throw new Error(`suggestion_decide: ${error.message}`);
}
