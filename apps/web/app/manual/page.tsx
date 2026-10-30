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
          id: "acontecimentos",
          title: "O tempo e os acontecimentos",
          icon: "zap",
          body: (
            <>
              <p>No Painel, escolha quanto tempo passar: os dias correm um a um, com a rotina de cada dia, o salário no início do mês e as manchetes. No meio deles, a vida acontece: convites, crises no bairro, propostas, cobranças, oportunidades.</p>
              <div className="mini-grid">
                <div><b>Decisão</b><span>o relógio para até você responder</span></div>
                <div><b>Oportunidade</b><span>responda quando quiser, até o prazo</span></div>
                <div><b>Informativo</b><span>só registra o que aconteceu</span></div>
                <div><b>Sem resposta</b><span>vale a opção mais passiva</span></div>
              </div>
              <p>Os acontecimentos dependem de quem você é e do momento: profissão, dinheiro, reputação, partido, cargo, campanha, contatos e o que você escolheu antes. Muitas histórias continuam semanas ou meses depois. Nenhuma opção é sempre a melhor, e as consequências aparecem no pop-up e no histórico da Carreira.</p>
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
              <p>O pedido leva de duas a três semanas. No meio da análise, os dirigentes costumam levantar uma objeção (críticas suas ao programa, pouca trajetória, ninguém de dentro que conheça você), e o que você fizer pesa na decisão. Uma recusa vem com o motivo e só permite novo pedido ao mesmo partido depois de 60 dias. Depois de filiado, você começa com pouco prestígio: tarefas, alas, disputas internas e lealdade constroem o espaço na chapa. Trocar de partido tem custo, e com mandato proporcional, fora da janela, custa o mandato.</p>
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
              <p>A campanha disputa sete grupos de eleitores. Na primeira reunião você escolhe onde concentrar força; pesquisas explicam o que mexeu nos números; adversários fictícios atacam, prometem e buscam apoios; debates têm um momento ao vivo que você responde. Boatos, gafes, propostas de financiamento por fora, cabos eleitorais, apoios de lideranças e promessas assinadas (cobradas no mandato) fazem diferença. Boas decisões aumentam as chances, nunca garantem a vitória.</p>
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
          id: "vida",
          title: "Saúde e fim da jornada",
          icon: "star",
          body: (
            <>
              <p>Seu personagem envelhece. A saúde cai com estresse, campanhas, processos e dívidas, e se recupera com descanso, férias e cuidados. A chance de morrer é pequena na juventude e cresce com a idade e com a saúde frágil. Você também pode anunciar a aposentadoria.</p>
              <p>Quando a carreira termina, o jogo mostra o balanço da trajetória: cargos, eleições, partidos, maiores conquistas, marcos, aliados, escândalos e o perfil das suas escolhas. Depois, você pode começar uma nova trajetória no mesmo mundo.</p>
            </>
          ),
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
