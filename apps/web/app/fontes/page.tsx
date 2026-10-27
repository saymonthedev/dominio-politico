import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Fontes" };

export default function Page() {
  return (
    <ContentPage title="Fontes e licenças" kicker="Source Registry">
      <p>Os pontos de partida são construídos a partir de dados públicos oficiais. Só são importados dados mínimos (LGPD): nome de urna, partido, cargo, UF, ano de nascimento, situação e votos.</p>
      <ul>
        <li><b>Tribunal Superior Eleitoral</b> — Portal de Dados Abertos (consulta_cand, votacao_candidato_munzona, detalhe_votacao_munzona), licença Creative Commons Attribution; e Resultados oficiais das Eleições 2026.</li>
        <li><b>Banco Central do Brasil</b> — SGS: Selic (432), IPCA (433, 13522), câmbio (1), dívida bruta (13762), desocupação (24369).</li>
        <li><b>IBGE</b> — Contas Nacionais Trimestrais (crescimento do PIB) e PME (desemprego de referência até 2010).</li>
      </ul>
      <h2>O que não é dado oficial</h2>
      <p>
        Posições ideológicas dos partidos nos seis eixos, cultura de entrada, disciplina, segmentos do eleitorado e todos os coeficientes do motor são{" "}
        <b>calibração de jogo</b>, ajustável e sem pretensão de classificação oficial. O eleitorado de cada UF é calibrado para reproduzir o 2º turno
        presidencial real do ponto de partida.
      </p>
      <h2>Marcas e imagens</h2>
      <p>
        O jogo não usa logotipos de partidos, fotos de políticos nem marcas de veículos de comunicação. Veículos e institutos de pesquisa são fictícios. Ativos
        reais só entram após registro de licença com status liberado.
      </p>
    </ContentPage>
  );
}
