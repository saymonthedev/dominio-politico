import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pause, transientAuthError } from "@/lib/supabase/transient";

type CookieChange = { name: string; value: string; options: CookieOptions };
interface Reading {
  claims: { sub?: string } | null;
  error: unknown;
  cookies: CookieChange[];
  headers: Record<string, string>;
}

/** Tempo máximo esperando o servidor de login: depois disso segue sem renovar (a tela decide). */
const LIMIT_MS = 12_000;
/** Esperas antes de tentar de novo quando outra requisição está renovando o mesmo login. */
const RETRY_MS = [400, 1200];

/**
 * Lê o login com um cliente novo. As mudanças de cookie ficam guardadas até sabermos o resultado:
 * uma renovação que falhou de passagem pede para apagar o login, e isso não pode chegar ao navegador.
 */
async function readSession(request: NextRequest): Promise<Reading> {
  const out: Reading = { claims: null, error: null, cookies: [], headers: {} };
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        out.cookies.push(...list);
        Object.assign(out.headers, headers);
      },
    },
  });
  try {
    const { data, error } = await sb.auth.getClaims();
    out.claims = data?.claims ?? null;
    out.error = error;
  } catch (e) {
    out.error = e;
  }
  return out;
}

function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((ok) => {
    timer = setTimeout(() => ok(null), Math.max(0, ms));
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/**
 * Renova a sessão só nas telas que usam o login (jogo, conta, admin e as rotas de dados do jogo).
 * As páginas públicas (início, manual, glossário, partidas...) não passam por aqui: abrem mesmo
 * com o servidor de login lento, sem gastar uma chamada a mais por visita. O domínio antigo
 * (vercel.app) é redirecionado pelo next.config, antes de qualquer função rodar.
 *
 * Várias requisições do mesmo navegador (a tela e as pré-cargas dos links) podem chegar juntas com
 * o login vencido. O servidor de login aceita uma renovação por vez e recusa as outras (409): quem
 * foi recusado espera a primeira terminar e renova de novo com o mesmo token, que o Supabase aceita.
 * Enquanto a falha for passageira, nada é apagado e ninguém é mandado para a tela de entrar.
 */
export async function middleware(request: NextRequest) {
  const deadline = Date.now() + LIMIT_MS;
  let reading: Reading | null = null;
  for (let attempt = 0; ; attempt++) {
    reading = await within(readSession(request), deadline - Date.now());
    // servidor de login travado: segue sem renovar em vez de prender a visita até o limite da Vercel
    if (!reading) return NextResponse.next({ request });
    if (!transientAuthError(reading.error)) break;
    const wait = RETRY_MS[attempt];
    if (wait === undefined || Date.now() + wait >= deadline) return NextResponse.next({ request });
    await pause(wait);
  }

  // o que a renovação mudou vale já para esta requisição (as telas leem o token novo) e volta ao navegador
  const { claims, cookies, headers } = reading;
  for (const c of cookies) {
    if (c.value) request.cookies.set(c.name, c.value);
    else request.cookies.delete(c.name);
  }
  const path = request.nextUrl.pathname;
  let response: NextResponse;
  if ((path.startsWith("/jogo") || path.startsWith("/conta")) && !claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    url.searchParams.set("next", path);
    response = NextResponse.redirect(url);
  } else {
    response = NextResponse.next({ request });
  }
  for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: ["/jogo/:path*", "/conta/:path*", "/admin/:path*", "/api/meus-dados", "/api/mundo/:path*", "/redefinir-senha"],
};
