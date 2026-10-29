"use client";
import { useActionState } from "react";
import { changeEmail, changePassword, requestPasswordReset, resendConfirmation, resetPassword, signIn, signUp, type FormState } from "@/app/auth/actions";
import { Captcha } from "./Captcha";
import { Checkbox, FormMessage, PasswordField, SubmitButton, TextField } from "./forms";
import { Icon } from "./Icon";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, {});
  return (
    <form action={action} noValidate autoComplete="off">
      <input type="hidden" name="next" value={next} />
      <TextField label="E-mail" name="acesso" inputMode="email" icon="mail" placeholder="voce@exemplo.com" />
      <PasswordField label="Senha" name="chave" placeholder="Sua senha" />
      <p className="auth__links">
        <a href="/esqueci-senha">Esqueci minha senha</a>
        <a href="/reenviar-confirmacao">Reenviar confirmação</a>
      </p>
      <Captcha reset={state} />
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
      <Captcha reset={state} />
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

function Done({ icon, title, text }: { icon: string; title: string; text?: string }) {
  return (
    <div className="auth__done">
      <span className="ico">
        <Icon name={icon} size={30} />
      </span>
      <h2 style={{ margin: 0 }}>{title}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

/** Pedido de link para criar uma senha nova. */
export function ForgotPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(requestPasswordReset, {});
  if (state.ok) return <Done icon="mail" title="Confira seu e-mail" text={state.message} />;
  return (
    <form action={action} noValidate autoComplete="off">
      <TextField label="E-mail da conta" name="acesso" inputMode="email" icon="mail" placeholder="voce@exemplo.com" />
      <Captcha reset={state} />
      <SubmitButton tone="primary" size="lg" full icon="arrow" pendingLabel="Enviando…">
        Enviar link
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
    </form>
  );
}

/** Senha nova, depois de abrir o link de recuperação. */
export function ResetPasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(resetPassword, {});
  return (
    <form action={action} noValidate autoComplete="off">
      <PasswordField label="Senha nova" name="chave" placeholder="Mínimo de 8 caracteres" showStrength />
      <PasswordField label="Repita a senha nova" name="chave2" placeholder="A mesma senha" />
      <SubmitButton tone="gold" size="lg" full icon="check" pendingLabel="Salvando…">
        Salvar senha nova
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
    </form>
  );
}

/** Reenvio do link de confirmação do cadastro. */
export function ResendConfirmationForm() {
  const [state, action] = useActionState<FormState, FormData>(resendConfirmation, {});
  if (state.ok) return <Done icon="mail" title="Confira seu e-mail" text={state.message} />;
  return (
    <form action={action} noValidate autoComplete="off">
      <TextField label="E-mail do cadastro" name="acesso" inputMode="email" icon="mail" placeholder="voce@exemplo.com" />
      <Captcha reset={state} />
      <SubmitButton tone="primary" size="lg" full icon="mail" pendingLabel="Enviando…">
        Reenviar link
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
    </form>
  );
}

/** Troca de senha na página Minha conta. */
export function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePassword, {});
  return (
    <form action={action} noValidate autoComplete="off" className="account-form" key={state.ok ? String(Date.now()) : "form"}>
      <PasswordField label="Senha atual" name="atual" placeholder="Sua senha de hoje" />
      <PasswordField label="Senha nova" name="chave" placeholder="Mínimo de 8 caracteres" showStrength />
      <PasswordField label="Repita a senha nova" name="chave2" placeholder="A mesma senha" />
      <Captcha reset={state} />
      <SubmitButton tone="primary" icon="lock" pendingLabel="Salvando…">
        Trocar senha
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
      {state.ok && <FormMessage tone="ok">{state.message}</FormMessage>}
    </form>
  );
}

/** Troca de e-mail na página Minha conta. */
export function ChangeEmailForm() {
  const [state, action] = useActionState<FormState, FormData>(changeEmail, {});
  return (
    <form action={action} noValidate autoComplete="off" className="account-form">
      <TextField label="E-mail novo" name="email" inputMode="email" icon="mail" placeholder="novo@exemplo.com" />
      <SubmitButton tone="primary" icon="mail" pendingLabel="Enviando…">
        Trocar e-mail
      </SubmitButton>
      {state.error && <FormMessage tone="err">{state.error}</FormMessage>}
      {state.ok && <FormMessage tone="ok">{state.message}</FormMessage>}
    </form>
  );
}
