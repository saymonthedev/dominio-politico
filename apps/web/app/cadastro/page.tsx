import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";
import { START_POINTS } from "@/lib/startpoints";

export const metadata: Metadata = { title: "Criar conta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; ano?: string }> }) {
  const { next, ano } = await searchParams;
  const target = next ?? (ano ? `/jogo/novo?ano=${ano}` : "/jogo");
  const sp = START_POINTS.find((s) => String(s.year) === ano);
  return (
    <>
      <PublicHeader loggedIn={false} />
      <AuthShell
        title="Criar conta"
        sub={sp ? <>Você vai começar no Brasil de {sp.year}, logo depois da vitória de {sp.winner}. Primeiro, sua conta.</> : "E-mail e senha. Depois você escolhe o ano em que sua história começa."}
        aside={{ title: <>Comece como cidadão. <em>Chegue ao Planalto</em>.</>, text: "Milite, filie-se, dispute convenções e eleições num país com partidos, eleitos e economia reais no ponto de partida." }}
        footer={
          <>
            Já tem conta? <a href={`/entrar?next=${encodeURIComponent(target)}`}>Entrar</a>
          </>
        }
      >
        <SignUpForm next={target} />
      </AuthShell>
      <Footer />
    </>
  );
}
