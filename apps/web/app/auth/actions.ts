"use server";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string; message?: string; code?: string };

/** Token do captcha (Cloudflare Turnstile), quando a proteção estiver ligada no Supabase. */
const captcha = (form: FormData) => {
  const t = form.get("captchaToken");
  return typeof t === "string" && t ? { captchaToken: t } : {};
};

const callback = (next: string) => `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`;

const safeNext = (n: FormDataEntryValue | null) => {
  const v = typeof n === "string" ? n : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/jogo";
};

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(form.get("acesso") ?? ""), password: String(form.get("chave") ?? ""), options: captcha(form) });
  if (error) {
    if (error.message === "Email not confirmed") return { error: "Confirme seu e-mail antes de entrar. Não chegou? Peça outro link em “Reenviar confirmação”.", code: "unconfirmed" };
    if (/captcha/i.test(error.message)) return { error: "Confirme que você não é um robô e tente de novo." };
    return { error: "E-mail ou senha inválidos." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("acesso") ?? "").trim();
  const password = String(form.get("chave") ?? "");
  if (!form.get("age")) return { error: "É preciso ter 16 anos ou mais para jogar." };
  if (!form.get("terms")) return { error: "Aceite os Termos de Uso e a Política de Privacidade." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const sb = await supabaseServer();
  const next = safeNext(form.get("next"));
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: callback(next),
      data: { age_confirmed: true, accepted_terms_at: new Date().toISOString() },
      ...captcha(form),
    },
  });
  if (error) {
    if (/captcha/i.test(error.message)) return { error: "Confirme que você não é um robô e tente de novo." };
    return { error: error.message.includes("registered") ? "Este e-mail já tem conta. Entre com sua senha." : `Não foi possível criar a conta: ${error.message}` };
  }
  if (data.session) redirect(next);
  return { ok: true, message: "Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, é só entrar." };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

/** Esqueci a senha: a resposta é a mesma exista ou não a conta, para não revelar quem joga. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("acesso") ?? "").trim();
  if (!emailOk(email)) return { error: "Informe um e-mail válido." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: callback("/redefinir-senha"), ...captcha(form) });
  if (error && /captcha/i.test(error.message)) return { error: "Confirme que você não é um robô e tente de novo." };
  if (error && /rate|seconds/i.test(error.message)) return { error: "Muitos pedidos seguidos. Espere um minuto e tente de novo." };
  return { ok: true, message: "Se houver uma conta com este e-mail, enviamos um link para criar uma senha nova. Ele vale por tempo limitado." };
}

/** Senha nova depois do link de recuperação (a sessão vem do link). */
export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("chave") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== String(form.get("chave2") ?? "")) return { error: "As duas senhas não são iguais." };
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: "O link expirou. Peça um novo em “Esqueci minha senha”." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: /different|same/i.test(error.message) ? "Escolha uma senha diferente da anterior." : `Não foi possível trocar a senha: ${error.message}` };
  redirect("/conta?senha=nova");
}

/** Reenvia o link de confirmação do cadastro. */
export async function resendConfirmation(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("acesso") ?? "").trim();
  if (!emailOk(email)) return { error: "Informe um e-mail válido." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: callback("/jogo"), ...captcha(form) } });
  if (error && /captcha/i.test(error.message)) return { error: "Confirme que você não é um robô e tente de novo." };
  if (error && /rate|seconds/i.test(error.message)) return { error: "Muitos pedidos seguidos. Espere um minuto e tente de novo." };
  return { ok: true, message: "Se este e-mail tiver um cadastro aguardando confirmação, um novo link já está a caminho." };
}

/** Troca de senha na conta: pede a senha atual antes. */
export async function changePassword(_: FormState, form: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user?.email) return { error: "Sessão expirada. Entre novamente." };
  const current = String(form.get("atual") ?? "");
  const password = String(form.get("chave") ?? "");
  if (password.length < 8) return { error: "A senha nova precisa ter pelo menos 8 caracteres." };
  if (password !== String(form.get("chave2") ?? "")) return { error: "As duas senhas novas não são iguais." };
  const check = await sb.auth.signInWithPassword({ email: data.user.email, password: current, options: captcha(form) });
  if (check.error) return { error: "A senha atual não confere." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: /different|same/i.test(error.message) ? "Escolha uma senha diferente da atual." : `Não foi possível trocar a senha: ${error.message}` };
  return { ok: true, message: "Senha trocada." };
}

/** Troca de e-mail: o Supabase manda um link de confirmação para o endereço novo (e para o atual, se a troca segura estiver ligada). */
export async function changeEmail(_: FormState, form: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return { error: "Sessão expirada. Entre novamente." };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!emailOk(email)) return { error: "Informe um e-mail válido." };
  if (email === data.user.email?.toLowerCase()) return { error: "Este já é o seu e-mail." };
  const { error } = await sb.auth.updateUser({ email }, { emailRedirectTo: callback("/conta?email=confirmado") });
  if (error) return { error: /registered|exists/i.test(error.message) ? "Este e-mail já é usado por outra conta." : `Não foi possível trocar o e-mail: ${error.message}` };
  return { ok: true, message: "Enviamos um link de confirmação. A troca só vale depois que você clicar nele." };
}
