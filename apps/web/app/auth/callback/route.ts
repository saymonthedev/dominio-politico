import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { isInviteCode } from "@/lib/referral";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Para onde voltar depois de confirmar. Aceita um caminho ("/jogo") ou o
 * endereço completo de retorno que o e-mail repassa ({{ .RedirectTo }}), desde
 * que seja deste mesmo site; nunca redireciona para fora.
 */
function nextPath(raw: string | null, origin: string): string {
  if (!raw) return "/jogo";
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    if (u.origin !== origin) return "/jogo";
    // o retorno do cadastro aponta para esta mesma rota, com o destino em ?next=
    if (u.pathname === "/auth/callback") return nextPath(u.searchParams.get("next"), origin);
    return u.pathname + u.search;
  } catch {
    return "/jogo";
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const safe = nextPath(url.searchParams.get("next"), url.origin);
  const sb = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (ok) {
    // conta nova que chegou por convite: fica ligada a quem convidou (o banco confere se é nova e se ainda não pagou)
    const { data } = await sb.auth.getUser();
    const convite = data.user?.user_metadata?.convite;
    if (isInviteCode(convite)) await sb.rpc("referral_claim", { p_code: convite });
  }
  return NextResponse.redirect(new URL(ok ? safe : `/entrar?erro=link&next=${encodeURIComponent(safe)}`, url.origin));
}
