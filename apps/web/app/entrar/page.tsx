import type { Metadata } from "next";
import { SignInForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Entrar" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <PublicHeader loggedIn={false} />
      <main className="container narrow" style={{ maxWidth: 440 }}>
        <div className="card pad-lg">
          <h1>Entrar</h1>
          <p className="muted">Volte para o seu mundo. Ele não parou enquanto você esteve fora.</p>
          <SignInForm next={next ?? "/jogo"} />
          <p className="mt muted">
            Ainda não tem conta? <a href={`/cadastro${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Criar conta</a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
