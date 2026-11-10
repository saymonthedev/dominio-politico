"use server";
import { moderateText } from "@dp/engine";
import { getSession } from "@/lib/game";

/**
 * Conversa entre jogadores (Mensagens, no celular). O banco confere em cada chamada se o jogador tem
 * personagem ativo no mundo e participa do canal (funções chat_* da migration 0026); aqui só entra o
 * filtro de texto (links e termos proibidos) antes de enviar.
 */

export interface ChatMessage {
  id: number;
  person_id: string;
  name: string;
  body: string;
  created_at: string;
}

export interface ChatThread {
  channel: string;
  last_id: number;
  last_at: string;
  last_body: string;
  last_name: string;
}

const WORLD = /^br\d{4}([pf][0-9a-f]{10})?$/;
const CHANNEL = /^(mundo|partido:[A-Za-z0-9_-]{1,60}|dm:[A-Za-z0-9_-]{1,80}\|[A-Za-z0-9_-]{1,80})$/;
const valid = (world: string, channel?: string) => WORLD.test(world) && (channel === undefined || CHANNEL.test(channel));
/** a mensagem que o banco recusou, sem o prefixo técnico */
const clean = (m: string) => m.replace(/^[A-Za-z_]+: /, "").slice(0, 200);

export async function chatFetch(world: string, channel: string, after = 0): Promise<{ ok: boolean; messages: ChatMessage[]; error?: string }> {
  if (!valid(world, channel)) return { ok: false, messages: [], error: "Conversa inválida." };
  const { sb, user } = await getSession();
  if (!user) return { ok: false, messages: [], error: "Sessão expirada. Entre de novo." };
  const { data, error } = await sb.rpc("chat_list", { p_world: world, p_channel: channel, p_after: Math.max(0, Math.floor(after)) });
  if (error) return { ok: false, messages: [], error: "Não foi possível carregar as mensagens agora." };
  return { ok: true, messages: (data ?? []) as ChatMessage[] };
}

export async function chatPost(world: string, channel: string, body: string): Promise<{ ok: boolean; error?: string }> {
  if (!valid(world, channel)) return { ok: false, error: "Conversa inválida." };
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  const mod = moderateText(text, { maxLength: 500, minLength: 1, checkRealNames: false });
  if (!mod.ok) return { ok: false, error: mod.reason ?? "Mensagem não permitida." };
  const { sb, user } = await getSession();
  if (!user) return { ok: false, error: "Sessão expirada. Entre de novo." };
  const { error } = await sb.rpc("chat_send", { p_world: world, p_channel: channel, p_body: text });
  if (error) return { ok: false, error: clean(error.message) || "Não foi possível enviar." };
  return { ok: true };
}

export async function chatThreads(world: string): Promise<ChatThread[]> {
  if (!valid(world)) return [];
  const { sb, user } = await getSession();
  if (!user) return [];
  const { data } = await sb.rpc("chat_threads", { p_world: world });
  return ((data ?? []) as ChatThread[]).sort((a, b) => b.last_id - a.last_id);
}

export async function chatReport(world: string, id: number): Promise<boolean> {
  if (!valid(world) || !Number.isFinite(id)) return false;
  const { sb, user } = await getSession();
  if (!user) return false;
  const { data } = await sb.rpc("chat_report", { p_world: world, p_message: Math.floor(id) });
  return !!data;
}
