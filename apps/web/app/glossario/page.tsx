import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Glossário" };

const TERMS: Array<[string, string]> = [
  ["Caixa dois", "Recursos de campanha movimentados à margem da prestação de contas à Justiça Eleitoral."],
  ["Coligação", "Aliança entre partidos para uma eleição. Proibida nas eleições proporcionais a partir de 2020 (EC 97/2017)."],
  ["Colaboração premiada", "Acordo em que o investigado confessa e entrega provas em troca de benefícios."],
  ["Convenção partidária", "Reunião em que o partido escolhe seus candidatos e coligações."],
  ["Copom", "Comitê de Política Monetária do Banco Central, que define a taxa Selic."],
  ["CPI", "Comissão Parlamentar de Inquérito: investigação conduzida pelo Legislativo."],
  ["Federação partidária", "União de partidos que atuam como um só por ao menos quatro anos (desde 2022)."],
  ["FEFC", "Fundo Especial de Financiamento de Campanha, dinheiro público distribuído aos partidos (desde 2018)."],
  ["Ficha Limpa", "Lei Complementar 135/2010: condenados por órgão colegiado ficam inelegíveis por 8 anos."],
  ["Janela partidária", "Período em que parlamentares podem trocar de partido sem perder o mandato."],
  ["Quociente eleitoral", "Votos válidos divididos pelo número de cadeiras; base da distribuição proporcional."],
  ["Segundo turno", "Nova votação entre os dois mais votados quando ninguém passa de 50% dos válidos."],
  ["Snapshot", "A fotografia real do país no dia seguinte ao 2º turno escolhido. Depois dela, tudo é simulação."],
];

export default function Page() {
  return (
    <ContentPage kicker="Referência" title="Glossário" lede="Os termos de política, eleição e justiça que aparecem no jogo.">
      <div className="glossary">
        {TERMS.map(([t, d]) => (
          <div key={t} className="card flat">
            <h3>{t}</h3>
            <p className="muted" style={{ margin: 0 }}>{d}</p>
          </div>
        ))}
      </div>
    </ContentPage>
  );
}
