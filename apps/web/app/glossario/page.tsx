import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Glossário" };

const TERMS: Array<[string, string]> = [
  ["Caixa dois", "Recursos de campanha movimentados à margem da prestação de contas à Justiça Eleitoral."],
  ["Coligação", "Aliança entre partidos para uma eleição. Proibida nas eleições proporcionais a partir de 2020 (EC 97/2017)."],
  ["Convenção partidária", "Reunião em que o partido escolhe seus candidatos e coligações."],
  ["Copom", "Comitê de Política Monetária do Banco Central, que define a taxa Selic."],
  ["CPI", "Comissão Parlamentar de Inquérito: investigação conduzida pelo Legislativo."],
  ["Colaboração premiada", "Acordo em que o investigado confessa e entrega provas em troca de benefícios."],
  ["Federação partidária", "União de partidos que atuam como um só por ao menos quatro anos (desde 2022)."],
  ["FEFC", "Fundo Especial de Financiamento de Campanha, dinheiro público distribuído aos partidos (desde 2018)."],
  ["Ficha Limpa", "Lei Complementar 135/2010: condenados por órgão colegiado ficam inelegíveis por 8 anos."],
  ["Janela partidária", "Período em que parlamentares podem trocar de partido sem perder o mandato."],
  ["Quociente eleitoral", "Votos válidos divididos pelo número de cadeiras; base da distribuição proporcional."],
  ["Segundo turno", "Nova votação entre os dois mais votados quando ninguém passa de 50% dos válidos (Presidente, governador e prefeito de cidades com mais de 200 mil eleitores)."],
  ["Snapshot", "A fotografia real do país no dia seguinte ao 2º turno escolhido. Depois dela, tudo é simulação."],
];

export default function Page() {
  return (
    <ContentPage title="Glossário" kicker="Referência">
      <dl className="kv" style={{ gridTemplateColumns: "minmax(140px, 220px) 1fr", rowGap: 14 }}>
        {TERMS.map(([t, d]) => (
          <div key={t} style={{ display: "contents" }}>
            <dt style={{ color: "var(--tinta)", fontWeight: 700 }}>{t}</dt>
            <dd style={{ fontWeight: 400 }}>{d}</dd>
          </div>
        ))}
      </dl>
    </ContentPage>
  );
}
