import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ForgotPasswordForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = pageMeta({ title: "Esqueci minha senha", path: "/esqueci-senha", description: "Receba por e-mail um link para criar uma senha nova no Domínio Político.", index: false });

export default function Page() {
  return (
    <>
      <PublicHeader loggedIn={false} />
      <AuthShell
        title="Esqueci minha senha"
        sub="Informe o e-mail da conta. Enviamos um link para você criar uma senha nova."
        aside={{ title: <>Seu personagem <em>continua lá</em>.</>, text: "O mundo seguiu andando, mas sua carreira, seu partido e seu dinheiro estão guardados. Crie uma senha nova e volte." }}
        footer={
          <>
            Lembrou a senha? <a href="/entrar">Entrar</a>
          </>
        }
      >
        <ForgotPasswordForm />
      </AuthShell>
      <Footer />
    </>
  );
}
