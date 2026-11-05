import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Renova a sessão só nas telas que usam o login (jogo, conta, admin e as rotas de dados do jogo).
 * As páginas públicas (início, manual, glossário, partidas...) não passam por aqui: abrem mesmo
 * com o servidor de login lento, sem gastar uma chamada a mais por visita. O domínio antigo
 * (vercel.app) é redirecionado pelo next.config, antes de qualquer função rodar.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  // renova o token quando vence e confere a assinatura localmente (sem ida ao servidor de login).
  // Com o servidor de login travado, segue sem renovar depois de alguns segundos (a tela decide)
  // em vez de prender a visita até o limite de 25 s da Vercel.
  const claims = await Promise.race([
    supabase.auth.getClaims().then(
      (r) => r.data?.claims ?? null,
      () => null,
    ),
    new Promise<"lento">((ok) => setTimeout(() => ok("lento"), 12_000)),
  ]);
  if (claims === "lento") return response;
  const path = request.nextUrl.pathname;
  if ((path.startsWith("/jogo") || path.startsWith("/conta")) && !claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/jogo/:path*", "/conta/:path*", "/admin/:path*", "/api/meus-dados", "/api/mundo/:path*", "/redefinir-senha"],
};
