import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Manual" };

export default function Page() {
  return (
    <ContentPage title="Manual do jogador" kicker="Guia">
      <h2>1. Primeiros passos</h2>
      <p>
        Crie seu personagem (nome, UF, idade, profissão, origem e posições em seis eixos). Você começa na capital da sua UF, sem partido. Trabalhe para ter
        renda, vá a eventos comunitários, faça voluntariado e escreva artigos para ganhar reputação e reconhecimento.
      </p>
      <h2>2. Entrar num partido</h2>
      <p>
        O diretório avalia: afinidade ideológica + reputação + relacionamento local + necessidade do partido + apoio de alas − histórico de escândalos. Alguns
        partidos têm porta aberta; outros exigem relacionamento; e, na mecânica do jogo, alguns só filiam por convite. Converse com lideranças e vá a
        reuniões antes de pedir.
      </p>
      <h2>3. Prazos que importam</h2>
      <p>
        Para disputar, você precisa estar filiado e com domicílio eleitoral no prazo da época (12 meses antes da eleição até 2014; 6 meses a partir de 2016)
        e ter a idade mínima: vereador 18, prefeito e deputado 21, governador 30, senador e presidente 35.
      </p>
      <h2>4. Pré-candidatura e convenção</h2>
      <p>
        No ano eleitoral, lance sua pré-candidatura. Na convenção, o partido compara você com outros nomes: prestígio interno, reputação, reconhecimento,
        alas. Para cargos proporcionais, basta prestígio mínimo; para majoritários, é disputa.
      </p>
      <h2>5. Campanha</h2>
      <p>
        Recursos: dinheiro (FEFC a partir de 2018, doações e — até 2014 — empresas), energia, voluntários, equipe e reputação. Comícios, caminhadas,
        entrevistas, podcasts, propostas, debates. Pesquisas mostram uma amostra com margem de erro — não a verdade.
      </p>
      <h2>6. Mandato</h2>
      <p>
        Parlamentares votam projetos (contrariar o partido custa prestígio), destinam emendas e fiscalizam. Chefes do Executivo lançam políticas com custo,
        cronograma e risco de atraso.
      </p>
      <h2>7. Crime, polícia e investigação</h2>
      <p>
        Ofertas de caixa dois e propina aparecem — aceitar dá dinheiro e cria um ato com rastros, testemunhas e cúmplices. A descoberta depende de risco e
        evidência. Você também pode investigar personagens, montar dossiês, acionar a Polícia Federal ou o Ministério Público, vazar para a imprensa ou propor
        CPI. Denúncia vazia volta contra você. Condenação por órgão colegiado gera inelegibilidade (Ficha Limpa, a partir de 2012).
      </p>
    </ContentPage>
  );
}
