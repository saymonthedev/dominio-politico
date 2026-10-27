"use server";
import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string; message?: string };

const safeNext = (n: FormDataEntryValue | null) => {
  const v = typeof n === "string" ? n : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/jogo";
};

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
  if (error) return { error: error.message === "Email not confirmed" ? "Confirme seu e-mail antes de entrar (veja sua caixa de entrada)." : "E-mail ou senha inválidos." };
  redirect(safeNext(form.get("next")));
}

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!form.get("age")) return { error: "É preciso ter 16 anos ou mais para jogar." };
  if (!form.get("terms")) return { error: "Aceite os Termos de Uso e a Política de Privacidade." };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  const sb = await supabaseServer();
  const next = safeNext(form.get("next"));
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      data: { age_confirmed: true, accepted_terms_at: new Date().toISOString() },
    },
  });
  if (error) return { error: error.message.includes("registered") ? "Este e-mail já tem conta. Entre com sua senha." : `Não foi possível criar a conta: ${error.message}` };
  if (data.session) redirect(next);
  return { ok: true, message: "Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, é só entrar." };
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}
