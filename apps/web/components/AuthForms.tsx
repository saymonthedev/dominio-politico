"use client";
import { useActionState } from "react";
import { signIn, signUp, type FormState } from "@/app/auth/actions";
import { Checkbox, FormMessage, PasswordField, SubmitButton, TextField } from "./forms";
import { Icon } from "./Icon";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} noValidate autoComplete="off">
      <input type="hidden" name="next" value={next} />
      <TextField label="E-mail" name="acesso" inputMode="email" icon="mail" placeholder="voce@exemplo.com" />
      <PasswordField label="Senha" name="chave" placeholder="Sua senha" />
      <SubmitButton tone="primary" size="lg" full icon="arrow" pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
    </form>
  );
}

export function SignUpForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signUp, {});
  if (state.ok)
    return (
      <div className="auth__done">
        <span className="ico">
          <Icon name="mail" size={30} />
        </span>
        <h2 style={{ margin: 0 }}>Confira seu e-mail</h2>
        <p className="muted" style={{ margin: 0 }}>{state.message}</p>
      </div>
    );
  return (
    <form action={action} noValidate autoComplete="off">
      <input type="hidden" name="next" value={next} />
      <TextField label="E-mail" name="acesso" inputMode="email" icon="mail" placeholder="voce@exemplo.com" />
      <PasswordField label="Senha" name="chave" placeholder="Mínimo de 8 caracteres" showStrength />
      <div style={{ margin: "6px 0 18px" }}>
        <Checkbox name="age">Tenho 16 anos ou mais.</Checkbox>
        <Checkbox name="terms">
          Li e aceito os <a href="/termos" target="_blank">Termos de Uso</a> e a <a href="/privacidade" target="_blank">Política de Privacidade</a>.
        </Checkbox>
      </div>
      <SubmitButton tone="gold" size="lg" full icon="arrow" pendingLabel="Criando conta…">
        Criar conta
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
      <div className="auth__fine">
        <Icon name="shield" size={18} />
        <span>
          Você cria um <b>personagem</b>, não um perfil político seu. Não pedimos CPF, título de eleitor nem endereço.
        </span>
      </div>
    </form>
  );
}
