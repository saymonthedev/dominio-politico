import type { Metadata } from "next";
import { SignUpForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Criar conta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; ano?: string }> }) {
  const { next, ano } = await searchParams;
  const target = next ?? (ano ? `/jogo/novo?ano=${ano}` : "/jogo");
  return (
    <>
      <PublicHeader loggedIn={false} />
      <main className="container narrow" style={{ maxWidth: 480 }}>
        <div className="card pad-lg">
          <h1>Criar conta</h1>
          <p className="muted">E-mail e senha. Depois você escolhe o ano em que sua história começa.</p>
          <SignUpForm next={target} />
          <p className="mt muted">
            Já tem conta? <a href={`/entrar?next=${encodeURIComponent(target)}`}>Entrar</a>
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
