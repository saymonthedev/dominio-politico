import { Callout, ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Fontes" };

export default function Page() {
  return (
    <ContentPage
      kicker="Source Registry"
      title="Fontes e licenças"
      lede="Os pontos de partida são construídos com dados públicos oficiais. Só importamos o mínimo necessário (LGPD): nome de urna, partido, cargo, UF, ano de nascimento, situação e votos."
      sections={[
        {
          id: "oficiais",
          title: "Dados oficiais",
          icon: "file",
          body: (
            <div className="source-list">
              <div><b>Tribunal Superior Eleitoral</b><span>Dados Abertos: consulta_cand, votacao_candidato_munzona, detalhe_votacao_munzona (CC-BY) · Resultados oficiais 2026</span></div>
              <div><b>Fotos de candidatos (TSE)</b><span>Dados Abertos do TSE, licença CC-BY. Fotos oficiais de candidatura, usadas só nos perfis e listas de pessoas reais, sempre com o ano da candidatura</span></div>
              <div><b>Banco Central do Brasil</b><span>SGS: Selic (432), IPCA (433, 13522), câmbio (1), dívida bruta (13762), desocupação (24369)</span></div>
              <div><b>IBGE</b><span>Contas Nacionais Trimestrais · malhas municipais (via geodata-br) · PME</span></div>
            </div>
          ),
        },
        {
          id: "calibracao",
          title: "O que é calibração de jogo",
          icon: "chart",
          body: (
            <p>
              Posições ideológicas dos partidos nos seis eixos, cultura de entrada, disciplina, segmentos do eleitorado e coeficientes do motor são{" "}
              <b>calibração de jogo</b>, ajustável e sem pretensão de classificação oficial. O eleitorado de cada UF é calibrado para reproduzir o 2º turno
              presidencial real do ponto de partida.
            </p>
          ),
        },
        {
          id: "marcas",
          title: "Marcas e imagens",
          icon: "lock",
          body: (
            <Callout tone="info" title="Sem logotipos, fotos ou marcas de mídia">
              Partidos aparecem só por sigla e cor. Veículos de imprensa e institutos de pesquisa são fictícios. Ativos reais só entram após registro de licença
              liberada.
            </Callout>
          ),
        },
      ]}
    />
  );
}
