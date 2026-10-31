import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Endereços que abrem o mesmo site e devem levar ao domínio oficial (um só endereço para o Google). */
const ALIAS_HOSTS = new Set(["dominio-politico.vercel.app"]);

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  if (ALIAS_HOSTS.has(host)) {
    const url = new URL(request.nextUrl.pathname + request.nextUrl.search, "https://dominio-politico.com.br");
    return NextResponse.redirect(url, 308);
  }
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
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  if ((path.startsWith("/jogo") || path.startsWith("/conta")) && !data.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|icons/|logo-mark.svg|manifest.webmanifest|robots.txt|sitemap.xml|api/cron).*)"],
};
