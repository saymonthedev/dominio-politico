import { Callout, ContentPage } from "@/components/ContentPage";
import { LOGO_CREDITS } from "@/lib/logos";

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
            <Callout tone="info" title="Logos dos partidos com licença registrada">
              Os logos vêm do Wikimedia Commons, só de arquivos em domínio público ou com licença livre (CC0, CC BY, CC BY-SA), com autor e licença listados
              abaixo. As marcas continuam pertencendo aos partidos e o uso aqui é só de identificação, num projeto de estudo, sem relação com eles e sem
              endosso. Veículos de imprensa e institutos de pesquisa do jogo são fictícios.
            </Callout>
          ),
        },
        {
          id: "logos",
          title: "Créditos dos logos",
          icon: "flag",
          body: (
            <div className="logo-credits">
              {LOGO_CREDITS.map((l) => (
                <div key={l.label} className="logo-credit">
                  <span className="pmark pmark--logo" style={{ width: 56, height: 56 }}>
                    <img src={l.src} alt={`Logo do ${l.acronym}`} width={l.w} height={l.h} loading="lazy" decoding="async" />
                  </span>
                  <div>
                    <b>{l.label}</b>
                    <span>
                      {l.license} · {l.author}
                    </span>
                    <span>
                      <a href={l.page} target="_blank" rel="noopener noreferrer">
                        {l.file}
                      </a>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
}
