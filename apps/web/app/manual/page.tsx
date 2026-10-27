import { Callout, ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Manual" };

export default function Page() {
  return (
    <ContentPage
      kicker="Guia"
      title="Manual do jogador"
      lede="Do primeiro evento comunitário à posse: o que importa em cada fase da carreira, os prazos legais da época e como funcionam crime, polícia e investigação."
      sections={[
        {
          id: "primeiros-passos",
          title: "Primeiros passos",
          icon: "flag",
          body: (
            <>
              <p>Crie seu personagem — nome, UF, idade, profissão, origem e posições em seis eixos. Você começa na sua cidade, sem partido.</p>
              <div className="mini-grid">
                <div><b>Trabalhe</b><span>renda para se manter</span></div>
                <div><b>Eventos</b><span>reputação e contatos</span></div>
                <div><b>Voluntariado</b><span>vira ativista</span></div>
                <div><b>Artigos</b><span>visibilidade (e polêmica)</span></div>
              </div>
            </>
          ),
        },
        {
          id: "partido",
          title: "Entrar num partido",
          icon: "users",
          body: (
            <>
              <p className="formula">aceite = afinidade + reputação + relacionamento local + necessidade do partido + apoio de ala − escândalos</p>
              <p>Alguns partidos têm porta aberta; outros exigem relacionamento; e, na mecânica do jogo, alguns só filiam por convite. Converse com lideranças e vá a reuniões antes de pedir.</p>
            </>
          ),
        },
        {
          id: "prazos",
          title: "Prazos que importam",
          icon: "clock",
          body: (
            <table>
              <thead><tr><th>Regra</th><th>Até 2014</th><th>A partir de 2016/2018</th></tr></thead>
              <tbody>
                <tr><td>Filiação antes da eleição</td><td>12 meses</td><td>6 meses</td></tr>
                <tr><td>Domicílio eleitoral</td><td>12 meses</td><td>6 meses (2018+)</td></tr>
                <tr><td>Doação de empresas</td><td>permitida</td><td>proibida</td></tr>
                <tr><td>Ficha Limpa</td><td colSpan={2}>a partir de 2012: condenação colegiada = 8 anos inelegível</td></tr>
              </tbody>
            </table>
          ),
        },
        {
          id: "idades",
          title: "Idade mínima",
          icon: "ballot",
          body: (
            <div className="mini-grid">
              <div><b>18</b><span>vereador</span></div>
              <div><b>21</b><span>prefeito e deputado</span></div>
              <div><b>30</b><span>governador</span></div>
              <div><b>35</b><span>senador e presidente</span></div>
            </div>
          ),
        },
        {
          id: "campanha",
          title: "Pré-candidatura e campanha",
          icon: "megaphone",
          body: (
            <>
              <p>No ano eleitoral, lance a pré-candidatura. Na convenção, o partido compara você com outros nomes (prestígio, reputação, reconhecimento, alas).</p>
              <p>Na campanha: comícios, caminhadas, entrevistas, podcasts, propostas e debates. Dinheiro vem do FEFC (desde 2018), de doações e — até 2014 — de empresas. Pesquisas mostram uma amostra com margem de erro, não a verdade.</p>
            </>
          ),
        },
        {
          id: "mandato",
          title: "Mandato",
          icon: "landmark",
          body: <p>Parlamentares votam projetos (contrariar o partido custa prestígio), destinam emendas e fiscalizam. Chefes do Executivo lançam políticas com custo, cronograma e risco de atraso.</p>,
        },
        {
          id: "crime",
          title: "Crime, polícia e investigação",
          icon: "gavel",
          body: (
            <>
              <p>Ofertas de caixa dois e propina aparecem. Aceitar dá dinheiro e cria um ato com rastro documental, testemunhas e cúmplices — a descoberta depende de risco e evidência.</p>
              <p>Você também pode investigar personagens, montar dossiês, acionar a Polícia Federal ou o Ministério Público, vazar para a imprensa ou propor CPI.</p>
              <Callout tone="warn" title="Cuidado">Denúncia sem base volta contra quem denunciou. E cúmplices pouco leais fazem delação.</Callout>
            </>
          ),
        },
      ]}
    />
  );
}
