"use client";
import { useActionState } from "react";
import { signIn, signUp, type FormState } from "@/app/auth/actions";

export function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Senha</label>
      <input id="password" name="password" type="password" autoComplete="current-password" required />
      <button className="btn mt" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Entrando…" : "Entrar"}
      </button>
      {state.error && <div className="form-msg err">{state.error}</div>}
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, {});
  if (state.ok) return <div className="form-msg ok">{state.message}</div>;
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">E-mail</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">Senha (mín. 8 caracteres)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <label className="check mt">
        <input type="checkbox" name="age" /> Tenho 16 anos ou mais.
      </label>
      <label className="check">
        <input type="checkbox" name="terms" /> Li e aceito os <a href="/termos" target="_blank">Termos de Uso</a> e a{" "}
        <a href="/privacidade" target="_blank">Política de Privacidade</a>.
      </label>
      <button className="btn gold mt" disabled={pending} style={{ width: "100%" }}>
        {pending ? "Criando…" : "Criar conta"}
      </button>
      {state.error && <div className="form-msg err">{state.error}</div>}
      <p className="muted mt" style={{ fontSize: ".82rem" }}>
        Você vai criar um <b>personagem</b> — não um perfil político seu. Não pedimos CPF, título de eleitor nem endereço.
      </p>
    </form>
  );
}
