import { pageMeta } from "@/lib/seo";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { INVITE_COOKIE, isInviteCode } from "@/lib/referral";
import { AuthShell } from "@/components/AuthShell";
import { SignUpForm } from "@/components/AuthForms";
import { Footer, PublicHeader } from "@/components/SiteChrome";
import { START_POINTS } from "@/lib/startpoints";
import { paywallOn, PRICE_LABEL } from "@/lib/payments";
import { TRIAL_LABEL } from "@/lib/price";

export const metadata: Metadata = pageMeta({ title: "Criar conta", path: "/cadastro", description: "Crie sua conta no Domínio Político e comece como cidadão num Brasil real, de 2002 a 2026, rumo ao Planalto." });

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; ano?: string; convite?: string }> }) {
  const { next, ano, convite } = await searchParams;
  const saved = (await cookies()).get(INVITE_COOKIE)?.value;
  const invite = isInviteCode(convite) ? convite.toUpperCase() : isInviteCode(saved) ? saved.toUpperCase() : null;
  const target = next ?? (ano ? `/jogo/novo?ano=${ano}` : "/jogo");
  const sp = START_POINTS.find((s) => String(s.year) === ano);
  return (
    <>
      <PublicHeader loggedIn={false} page="cadastro" />
      <AuthShell
        title="Criar conta"
        sub={
          sp ? (
            <>Você vai começar no Brasil de {sp.year}, logo depois da vitória de {sp.winner}. Primeiro, sua conta.</>
          ) : invite ? (
            "Você chegou pelo convite de um amigo. E-mail e senha; depois você escolhe o ano em que sua história começa."
          ) : (
            "E-mail e senha. Depois você escolhe o ano em que sua história começa."
          )
        }
        aside={{ title: <>Comece como cidadão. <em>Chegue ao Planalto</em>.</>, text: `Milite, filie-se, dispute convenções e eleições num país com partidos, eleitos e economia reais no ponto de partida.${paywallOn() ? ` ${TRIAL_LABEL} grátis para experimentar; depois, ${PRICE_LABEL} por mês, por Pix.` : ""}` }}
        footer={
          <>
            Já tem conta? <a href={`/entrar?next=${encodeURIComponent(target)}`}>Entrar</a>
          </>
        }
      >
        <SignUpForm next={target} invite={invite} />
      </AuthShell>
      <Footer />
    </>
  );
}
