import { Callout, ContentPage } from "@/components/ContentPage";
import { DoDont, Steps, SummaryTiles, UpdatedAt } from "@/components/Legal";
import { DISCLAIMER } from "@/components/SiteChrome";

export const metadata = { title: "Termos de Uso" };

export default function Page() {
  return (
    <ContentPage
      kicker="Regras do jogo"
      title="Termos de Uso"
      lede="Ao criar uma conta, você concorda com estas regras. Elas existem para que a simulação continue sendo um jogo, e não uma ferramenta de campanha."
      heroExtra={
        <>
          <SummaryTiles
            items={[
              { icon: "shield", title: "16 anos ou mais", text: "Classificação indicativa do jogo." },
              { icon: "book", title: "Entretenimento", text: "E educação política. Não é propaganda eleitoral." },
              { icon: "users", title: "Sem gente real", text: "Personagens de jogadores não podem imitar políticos reais." },
              { icon: "lock", title: "Fica no jogo", text: "Nada é publicado em redes sociais reais." },
            ]}
          />
          <UpdatedAt date="27/10/2026" version="1.1" />
        </>
      }
      sections={[
        {
          id: "natureza",
          title: "O que é o Domínio Político",
          icon: "book",
          body: (
            <>
              <p>{DISCLAIMER}</p>
              <Callout tone="real" title="Fatos reais, futuro simulado">
                O ponto de partida usa resultados oficiais do TSE e séries do Banco Central. Tudo o que acontece depois é simulação e vem marcado como tal.
              </Callout>
            </>
          ),
        },
        {
          id: "conduta",
          title: "Conduta",
          icon: "users",
          body: (
            <DoDont
              dos={[
                "Criar um personagem fictício com qualquer posição política",
                "Fazer campanha, alianças e oposição dentro do jogo",
                "Investigar e denunciar personagens que cometeram ilícitos no jogo",
                "Compartilhar capturas de tela identificadas como simulação",
              ]}
              donts={[
                "Usar o nome ou a imagem de políticos reais no seu personagem",
                "Publicar conteúdo ofensivo, discriminatório ou de ódio",
                "Apresentar eventos do jogo como notícia real",
                "Automatizar ações ou explorar falhas do sistema",
              ]}
            />
          ),
        },
        {
          id: "pessoas-reais",
          title: "Pessoas e partidos reais",
          icon: "shield",
          body: (
            <>
              <p>
                Os partidos e os eleitos do ponto de partida são reais. Para essas pessoas, o jogo só mostra fatos com fonte e desempenho simulado em cargos e eleições.
              </p>
              <Callout tone="warn" title="Nunca atribuímos crimes, falas ou condições de saúde a pessoas reais">
                Crimes e escândalos do jogo são cometidos apenas por personagens fictícios ou de jogadores, que podem ser filiados a partidos reais. A reputação dos partidos
                muda pelo que esses personagens fazem dentro da simulação.
              </Callout>
            </>
          ),
        },
        {
          id: "moderacao",
          title: "Moderação e sanções",
          icon: "gavel",
          body: (
            <Steps
              items={[
                { title: "Filtro automático", text: "Nomes de personagens e títulos de propostas passam por verificação antes de entrar no mundo." },
                { title: "Correção", text: "Conteúdo que viole estes termos pode ser renomeado ou removido." },
                { title: "Suspensão", text: "Violações repetidas ou graves podem levar à suspensão da conta." },
              ]}
            />
          ),
        },
        {
          id: "simulacao",
          title: "Sem vantagens pagas",
          icon: "coins",
          body: (
            <Callout title="Tudo se conquista jogando">
              Não há venda de votos, imunidade, cargos ou qualquer vantagem eleitoral paga. Boatos e desinformação existem apenas dentro do mundo simulado.
            </Callout>
          ),
        },
      ]}
    />
  );
}
