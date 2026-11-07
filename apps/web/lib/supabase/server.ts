import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "../env";
import { pause, transientAuthError } from "./transient";

/**
 * Cliente do Supabase com a sessão dos cookies. Só quem sai da conta (`signOut: true`) apaga o
 * login: uma renovação que falha de passagem (outra aba renovando ao mesmo tempo, servidor de login
 * num pico) também pede para apagar os cookies, e isso deslogava o jogador sem motivo.
 */
export async function supabaseServer(opts: { signOut?: boolean } = {}) {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        if (!opts.signOut && list.length && list.every((c) => !c.value)) return;
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

function toUser(c: { sub?: string; email?: unknown } | null | undefined): SessionUser | null {
  if (!c?.sub) return null;
  return { id: c.sub, email: typeof c.email === "string" ? c.email : undefined };
}

/**
 * Cliente e usuário da requisição, sem ida ao servidor de login: o token é conferido localmente com
 * a chave pública do projeto (getClaims). Telas que precisam dos dados completos da conta usam
 * getUser. Se o login venceu e outra requisição está renovando o mesmo login agora (ou o servidor
 * de login engasgou), espera um pouco e lê de novo com um cliente novo: o anterior guarda a falha
 * por alguns segundos.
 */
export async function currentUser() {
  let sb = await supabaseServer();
  let { data, error } = await sb.auth.getClaims();
  if (!data?.claims && transientAuthError(error)) {
    await pause(600);
    sb = await supabaseServer();
    ({ data, error } = await sb.auth.getClaims());
  }
  return { sb, user: toUser(data?.claims) };
}
