import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./env";

/**
 * Guarda um erro do servidor para o painel /admin. Leve de propósito (sem o motor),
 * para poder ser usado pelo instrumentation. Nunca falha.
 */
export async function reportError(source: string, path: string | null, error: unknown, digest?: string | null): Promise<void> {
  const secret = process.env.SIM_SECRET;
  if (!secret || !SUPABASE_URL) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  try {
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    await db.rpc("log_error", { p_secret: secret, p_source: source, p_path: path, p_message: message, p_digest: digest ?? null });
  } catch {
    // erro ao registrar erro: ignora
  }
}
