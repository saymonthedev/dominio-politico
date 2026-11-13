import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { pause, transientAuthError } from "@/lib/supabase/transient";

type CookieChange = { name: string; value: string; options: CookieOptions };
type Supabase = ReturnType<typeof createServerClient>;
interface Reading {
  claims: { sub?: string } | null;
  error: unknown;
  cookies: CookieChange[];
  headers: Record<string, string>;
  sb: Supabase;
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
  const out = { claims: null, error: null, cookies: [], headers: {} } as unknown as Reading;
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        out.cookies.push(...list);
        Object.assign(out.headers, headers);
      },
    },
  });
  out.sb = sb;
  try {
    const { data, error } = await sb.auth.getClaims();
    out.claims = data?.claims ?? null;
    out.error = error;
  } catch (e) {
    out.error = e;
  }
  return out;
}

/*
 * Assinatura (R$ 3 por mês): só as telas e os dados do jogo exigem; a conta, o admin e a página de
 * assinar ficam abertos. Liga só com a chave do Mercado Pago (sem ela, ninguém teria como pagar) e
 * não vale para as contas do admin. Quem pagou recebe um cookie assinado com a data até quando a
 * assinatura vale: as próximas visitas passam sem ir ao banco até essa data (ou por 7 dias).
 */
const PAYWALL = !!process.env.MP_ACCESS_TOKEN && process.env.PAYWALL !== "off";
const ADMINS = new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));
const PASS = "dp_assinatura";
const paidArea = (path: string) => path.startsWith("/jogo") || path.startsWith("/api/mundo");

let passKey: Promise<CryptoKey> | null = null;
async function sign(payload: string): Promise<string> {
  passKey ??= crypto.subtle.importKey("raw", new TextEncoder().encode(`assinatura:${process.env.SIM_SECRET ?? ""}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await passKey, new TextEncoder().encode(payload)));
  return btoa(String.fromCharCode(...mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface Access {
  ok: boolean;
  pass?: { value: string; maxAge: number };
}

/** A conta pode jogar? Pelo cookie assinado ou, se ele venceu ou não existe, pela tabela de assinaturas. */
async function access(request: NextRequest, sb: Supabase, uid: string): Promise<Access> {
  const c = request.cookies.get(PASS)?.value;
  if (c) {
    const [u, t, mac] = c.split(".");
    if (u === uid && Number(t) > Date.now() && mac === (await sign(`${u}.${t}`))) return { ok: true };
  }
  const { data, error } = await sb.from("subscriptions").select("paid_until").eq("user_id", uid).maybeSingle();
  // banco fora do ar: deixa passar (melhor do que trancar quem pagou)
  if (error) return { ok: true };
  const until = data ? Date.parse((data as { paid_until: string }).paid_until) : 0;
  if (!(until > Date.now())) return { ok: false };
  const payload = `${uid}.${until}`;
  return { ok: true, pass: { value: `${payload}.${await sign(payload)}`, maxAge: Math.max(60, Math.min(7 * 86_400, Math.floor((until - Date.now()) / 1000))) } };
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
  if ((path.startsWith("/jogo") || path.startsWith("/conta") || path === "/assinar") && !claims?.sub) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = "";
    url.searchParams.set("next", path);
    response = NextResponse.redirect(url);
  } else if (PAYWALL && paidArea(path) && claims?.sub && !ADMINS.has(claims.sub)) {
    const ok = (await within(access(request, reading.sb, claims.sub), deadline - Date.now())) ?? { ok: true };
    if (ok.ok) {
      response = NextResponse.next({ request });
      if (ok.pass) response.cookies.set(PASS, ok.pass.value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: ok.pass.maxAge });
    } else {
      const url = request.nextUrl.clone();
      url.pathname = "/assinar";
      url.search = "";
      response = NextResponse.redirect(url);
    }
  } else {
    response = NextResponse.next({ request });
  }
  for (const c of cookies) response.cookies.set(c.name, c.value, c.options);
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: ["/jogo/:path*", "/conta/:path*", "/admin/:path*", "/assinar", "/api/meus-dados", "/api/mundo/:path*", "/redefinir-senha"],
};
