import { notFound } from "next/navigation";
import { pixInfo } from "@/components/Announce";
import { ContentPage } from "@/components/ContentPage";
import { SupportPix } from "@/components/SupportDialog";
import { DONATIONS } from "@/lib/donations";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Apoie o jogo",
  path: "/apoie",
  description: "O Domínio Político é gratuito e feito por uma pessoa só. Se quiser ajudar a manter os servidores no ar, dá para apoiar com Pix. É opcional.",
  index: false,
});

/** Página de apoio por Pix (link do rodapé e para divulgar). Só existe com as doações ligadas. */
export default async function Page() {
  if (!DONATIONS) notFound();
  const pix = await pixInfo();
  return (
    <ContentPage
      kicker="Apoie o jogo"
      title="Apoie o Domínio Político"
      lede="O jogo é gratuito e feito por uma pessoa só. Com tanta gente jogando, manter os servidores no ar custa caro. Se você curte o jogo e quiser ajudar, qualquer valor por Pix faz diferença."
    >
      <section className="support-page">
        <p className="support__free">Doar é opcional: o jogo continua 100% grátis, com ou sem doação. Obrigado por jogar!</p>
        <SupportPix pix={pix} />
      </section>
    </ContentPage>
  );
}
