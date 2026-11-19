import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/ContentPage";
import { Icon } from "@/components/Icon";
import { paywallOn } from "@/lib/payments";
import { PRICE_LABEL, TRIAL_LABEL } from "@/lib/price";
import { isInviteCode, readCard } from "@/lib/referral";
import { pageMeta } from "@/lib/seo";
import { InviteCookie } from "./InviteCookie";

type Props = { params: Promise<{ codigo: string }>; searchParams: Promise<{ c?: string }> };

/** A prévia do link (WhatsApp, redes) mostra o cartão de quem convidou. */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { codigo } = await params;
  const { c } = await searchParams;
  const card = isInviteCode(codigo) ? readCard(codigo, c) : null;
  return pageMeta({
    title: card ? `${card.n} te convida para o Domínio Político` : "Convite para o Domínio Político",
    shareTitle: card ? `${card.n}: ${card.t}` : "Convite para o Domínio Político",
    description: "Jogo de política brasileira online: crie seu político, dispute eleições e chegue ao Planalto num Brasil real.",
    path: `/convite/${codigo}`,
    image: card ? `/convite/${codigo}/cartao?f=feed&c=${c}` : undefined,
    index: false,
  });
}

/** Página do convite: o cartão de quem convidou e o caminho para criar a conta. */
export default async function Page({ params, searchParams }: Props) {
  const { codigo } = await params;
  if (!isInviteCode(codigo)) notFound();
  const { c } = await searchParams;
  const code = codigo.toUpperCase();
  const card = readCard(code, c);
  const img = `/convite/${code}/cartao?f=feed${card ? `&c=${c}` : ""}`;
  return (
    <ContentPage
      kicker="Convite"
      title={card ? `${card.n} te convidou para o Domínio Político` : "Você foi convidado para o Domínio Político"}
      lede="O jogo de carreira política brasileira: comece como cidadão, filie-se, dispute eleições e tente chegar ao Planalto num Brasil que parte do real."
    >
      <InviteCookie code={code} />
      <section className="invite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="invite__card" src={img} alt={card ? `Cartão de ${card.n}: ${card.t}` : "Cartão do convite"} width={600} height={315} />
        <div className="invite__cta">
          <a className="ui-btn ui-btn--gold ui-btn--lg" href={`/cadastro?convite=${code}`}>
            <Icon name="play" size={18} /> <span>Criar conta e jogar</span>
          </a>
          <a className="ui-btn ui-btn--ghost" href="/">
            <span>Conhecer o jogo</span>
          </a>
          <p className="muted small">{paywallOn() ? `Conta nova joga ${TRIAL_LABEL} grátis; depois, ${PRICE_LABEL} por mês, por Pix.` : "Crie a conta e comece agora."}</p>
        </div>
      </section>
    </ContentPage>
  );
}
