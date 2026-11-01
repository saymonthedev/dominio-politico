import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "../env";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // chamado de um Server Component: o middleware renova a sessão
        }
      },
    },
  });
}

/** Quem está logado, pelo que o token assinado garante (id e e-mail). */
export interface SessionUser {
  id: string;
  email?: string;
}

/**
 * Usuário da sessão sem ida ao servidor de login: o token é conferido localmente com a chave
 * pública do projeto (getClaims). Telas que precisam dos dados completos da conta usam getUser.
 */
export async function sessionUser(sb: SupabaseClient): Promise<SessionUser | null> {
  const { data } = await sb.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return null;
  return { id: c.sub, email: typeof c.email === "string" ? c.email : undefined };
}

export async function currentUser() {
  const sb = await supabaseServer();
  return { sb, user: await sessionUser(sb) };
}
