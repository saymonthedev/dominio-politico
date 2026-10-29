import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ResendConfirmationForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Reenviar confirmação" };

export default function Page() {
  return (
    <>
      <PublicHeader loggedIn={false} />
      <AuthShell
        title="Reenviar confirmação"
        sub="O link de confirmação não chegou ou venceu? Informe o e-mail do cadastro e mandamos outro."
        aside={{ title: <>Falta <em>um passo</em>.</>, text: "Confirme o e-mail para ativar a conta. Depois é só escolher o ano de partida e criar seu personagem." }}
        footer={
          <>
            Lembrou a senha? <a href="/entrar">Entrar</a>
          </>
        }
      >
        <ResendConfirmationForm />
      </AuthShell>
      <Footer />
    </>
  );
}
