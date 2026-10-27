import { ContentPage } from "@/components/ContentPage";
import { DISCLAIMER } from "@/components/SiteChrome";

export const metadata = { title: "Termos de Uso" };

export default function Page() {
  return (
    <ContentPage title="Termos de Uso" kicker="Regras">
      <p><b>{DISCLAIMER}</b></p>
      <ul>
        <li>Classificação indicativa: 16 anos ou mais.</li>
        <li>O jogo é entretenimento e educação. Não é ferramenta de campanha, propaganda eleitoral ou pesquisa de opinião real.</li>
        <li>Nomes de personagens e títulos de propostas passam por moderação; é proibido usar nomes de figuras políticas reais ou conteúdo ofensivo.</li>
        <li>Boatos e desinformação existem apenas dentro do mundo simulado; nada é publicado em redes sociais reais.</li>
        <li>Não há venda de votos, imunidade ou vantagem eleitoral paga.</li>
      </ul>
    </ContentPage>
  );
}
