import { pageMeta } from "@/lib/seo";
import { Callout, ContentPage } from "@/components/ContentPage";

export const metadata = pageMeta({ title: "Como funciona", path: "/como-funciona", description: "Como funciona o Domínio Político: escolha um Brasil real de 2002 a 2026, crie seu personagem e dispute eleições, cargos e partidos num país que segue andando." });

export default function Page() {
  return (
    <ContentPage
      kicker="O jogo"
      title="Como funciona"
      lede="Um simulador persistente de carreira política brasileira: o país começa idêntico ao real no dia seguinte a uma eleição presidencial — e daí em diante a história é escrita por você, pelos outros jogadores e pelo próprio mundo."
      sections={[
        {
          id: "ponto-de-partida",
          title: "Escolha um ponto de partida",
          icon: "flag",
          body: (
            <>
              <p>Sempre o dia seguinte a um 2º turno presidencial: 2002, 2006, 2010, 2014, 2018, 2022 ou 2026. Cada ano é um mundo separado e persistente.</p>
              <ul className="checks">
                <li>Partidos e federações do registro do TSE naquela data</li>
                <li>Presidente em exercício e eleito, governadores, senadores, deputados federais e estaduais</li>
                <li>Prefeitos e câmaras municipais eleitos dois anos antes</li>
                <li>Selic, inflação, câmbio, dívida e desemprego do Banco Central e do IBGE</li>
              </ul>
            </>
          ),
        },
        {
          id: "relogio",
          title: "O relógio do mundo",
          icon: "clock",
          body: (
            <>
              <p>
                No mundo compartilhado, o tempo anda em <b>rodadas de 2 horas</b>. Em cada rodada você vive os seus dias no seu ritmo: até <b>2 meses de jogo</b> de
                dia e 1 semana nas rodadas da madrugada. Quando as 2 horas acabam, o mundo anda para todos, e os dias que você não viveu ficam para trás.
              </p>
              <p>No mundo só seu, o tempo para enquanto você não joga: você avança 1 dia, 1 semana, 15 dias ou 1 mês quando quiser, e o mundo mostra o que aconteceu.</p>
              <p>Copom decide juros, a economia oscila, partidos avaliam filiações, a janela partidária abre, convenções escolhem candidatos e eleições acontecem a cada dois anos.</p>
            </>
          ),
        },
        {
          id: "carreira",
          title: "Sua carreira",
          icon: "landmark",
          body: (
            <>
              <div className="ladder">
                {["Cidadão", "Ativista", "Filiado", "Quadro", "Pré-candidato", "Candidato", "Eleito", "Cargos maiores"].map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <p className="mt">Cada ação gasta energia e tem retorno decrescente: fazer o mesmo comício vinte vezes não vale vinte vezes mais.</p>
            </>
          ),
        },
        {
          id: "motor",
          title: "O motor decide, o texto narra",
          icon: "chart",
          body: (
            <p>
              Toda aleatoriedade vem de uma semente — o mesmo mundo reproduz a mesma história, o que torna eleições e investigações auditáveis. As notícias são
              escritas a partir de fatos estruturados e passam por uma política de conteúdo antes de serem publicadas.
            </p>
          ),
        },
        {
          id: "pessoas-reais",
          title: "Pessoas reais e ficção",
          icon: "shield",
          body: (
            <>
              <p>
                Pessoas reais aparecem com os fatos públicos do snapshot e, depois disso, como atores da simulação: disputam eleições hipotéticas, trocam de
                partido, votam projetos — sempre com o selo <span className="badge sim">Simulação</span>.
              </p>
              <Callout tone="warn" title="O que o jogo nunca faz">
                Inventar crimes, corrupção, falas entre aspas, saúde ou vida íntima de pessoas reais. Esquemas e escândalos envolvem jogadores e personagens
                gerados pelo jogo — que podem ser filiados a partidos reais.
              </Callout>
            </>
          ),
        },
      ]}
    />
  );
}
