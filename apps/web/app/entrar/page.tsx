import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignInForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <PublicHeader loggedIn={false} />
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
        <SignInForm next={next ?? "/jogo"} />
      </AuthShell>
      <Footer />
    </>
  );
}
