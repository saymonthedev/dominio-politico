import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "@/components/AuthForms";
import { FormMessage } from "@/components/forms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = pageMeta({ title: "Entrar", path: "/entrar", description: "Entre na sua conta do Domínio Político e continue sua carreira política de onde parou.", index: false });

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; erro?: string }> }) {
  const { next, erro } = await searchParams;
  return (
    <>
      <PublicHeader loggedIn={false} page="entrar" />
      <AuthShell
        title="Entrar"
        sub="Volte para o seu mundo. Ele não parou enquanto você esteve fora."
        aside={{ title: <>O país andou <em>enquanto você esteve fora</em>.</>, text: "Pesquisas saíram, o Copom se reuniu e alguém pode ter aberto uma CPI. Entre para ver o que mudou na sua carreira." }}
        footer={
          <>
            Ainda não tem conta? <a href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Criar conta grátis</a>
          </>
        }
      >
        {erro === "link" && (
          <FormMessage tone="info">
            Este link expirou ou já foi usado. Se você já confirmou o e-mail, é só entrar com sua senha. Se não, <a href="/reenviar-confirmacao">peça um link novo</a>.
          </FormMessage>
        )}
        <SignInForm next={next ?? "/jogo"} />
      </AuthShell>
      <Footer />
    </>
  );
}
