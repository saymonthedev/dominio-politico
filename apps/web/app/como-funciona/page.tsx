import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Como funciona" };

export default function Page() {
  return (
    <ContentPage title="Como funciona" kicker="O jogo">
      <p>
        Domínio Político é um <b>simulador persistente de carreira política brasileira</b>. Você escolhe um ponto de partida — sempre o dia seguinte a um 2º
        turno presidencial (2002, 2006, 2010, 2014, 2018, 2022 ou 2026) — e entra num mundo que começa idêntico ao Brasil real daquela data: partidos,
        federações, presidente em exercício e eleito, governadores, senadores, deputados federais e estaduais, prefeitos das capitais e indicadores
        econômicos.
      </p>
      <h2>O relógio do mundo</h2>
      <p>
        O tempo passa sozinho: por padrão, <b>2 dias de jogo por hora real</b>. Copom decide juros, a economia oscila, partidos avaliam filiações, a janela
        partidária abre, convenções escolhem candidatos e as eleições acontecem a cada dois anos — com pesquisas, debates e segundo turno. Quando você volta,
        o mundo andou.
      </p>
      <h2>Sua carreira</h2>
      <p>
        Cidadão → ativista → aproximação partidária → filiado → quadro → pré-candidato → candidato → eleito → mandato → cargos maiores. Cada ação gasta
        energia e tem retorno decrescente: fazer o mesmo comício vinte vezes não vale vinte vezes mais.
      </p>
      <h2>A regra de ouro: o motor decide, o texto narra</h2>
      <p>
        Toda aleatoriedade vem de uma semente: o mesmo mundo reproduz a mesma história. Notícias são escritas a partir de fatos estruturados e passam por uma
        política de conteúdo antes de serem publicadas.
      </p>
      <h2>Pessoas reais e ficção</h2>
      <p>
        Pessoas reais aparecem com os fatos públicos do snapshot (cargo, partido, votação) e, depois disso, como atores da simulação — disputando eleições
        hipotéticas, trocando de partido, votando projetos — sempre com o selo <span className="badge sim">Simulação</span>. O jogo <b>nunca</b> inventa
        crimes, corrupção, falas entre aspas, saúde ou vida íntima de pessoas reais. Crimes, esquemas e escândalos envolvem jogadores e personagens gerados
        pelo jogo, que podem ser filiados a partidos reais.
      </p>
    </ContentPage>
  );
}
