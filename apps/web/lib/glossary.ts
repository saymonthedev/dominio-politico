/**
 * Termos de política, eleição, dinheiro e justiça que aparecem no jogo.
 * Usado na página /glossario e nas dicas dos termos (componente Term).
 */
export interface GlossaryEntry {
  term: string;
  text: string;
}

const ENTRIES: GlossaryEntry[] = [
  { term: "Apoiamento", text: "Assinaturas de eleitores não filiados exigidas para registrar um partido novo: 0,5% dos votos válidos da última eleição para a Câmara, espalhados por pelo menos 9 estados." },
  { term: "Caixa dois", text: "Recursos de campanha movimentados à margem da prestação de contas à Justiça Eleitoral." },
  { term: "Cláusula de desempenho", text: "Regra da EC 97/2017: só recebem fundo partidário e tempo de TV os partidos que elegem um número mínimo de deputados federais (ou atingem um percentual de votos). A exigência sobe a cada eleição até 2030." },
  { term: "Coaf", text: "Conselho de Controle de Atividades Financeiras: recebe comunicações de bancos sobre movimentações suspeitas e alerta os órgãos de investigação." },
  { term: "Coligação", text: "Aliança entre partidos para uma eleição. Proibida nas eleições proporcionais a partir de 2020 (EC 97/2017)." },
  { term: "Colaboração premiada", text: "Acordo em que o investigado confessa e entrega provas em troca de redução de pena (Lei 12.850/2013). Também chamada de delação." },
  { term: "Convenção partidária", text: "Reunião em que o partido escolhe seus candidatos e alianças. Acontece em um período fixo do ano eleitoral." },
  { term: "Copom", text: "Comitê de Política Monetária do Banco Central, que define a taxa Selic a cada 45 dias." },
  { term: "CPI", text: "Comissão Parlamentar de Inquérito: investigação conduzida pelo Legislativo, com poderes próprios de autoridade judicial." },
  { term: "Cultura de entrada", text: "Como cada partido recebe novos filiados no jogo: aberto a pedidos, só com relacionamento com alguém de dentro ou só por convite." },
  { term: "Diretório", text: "Órgão de direção de um partido em cada nível (municipal, estadual e nacional). É quem aprova filiações e candidaturas." },
  { term: "Emenda parlamentar", text: "Parte do Orçamento que deputados e senadores indicam para obras e serviços nas suas bases." },
  { term: "Energia", text: "Recurso do jogo: cada ação gasta energia, que se recupera 25 pontos por dia de jogo." },
  { term: "Federação partidária", text: "União de partidos que atuam como um só, nacionalmente, por ao menos quatro anos (desde 2022)." },
  { term: "FEFC", text: "Fundo Especial de Financiamento de Campanha: dinheiro público distribuído aos partidos para as campanhas (desde 2018), conforme votos e bancadas no Congresso." },
  { term: "Fechamento do mês", text: "No dia 1 de cada mês o jogo fecha suas contas: salário ou subsídio, impostos, rendimentos, custo de vida, contribuição ao partido e juros." },
  { term: "Ficha Limpa", text: "Lei Complementar 135/2010: condenados por órgão colegiado por certos crimes ficam inelegíveis até 8 anos depois de cumprir a pena." },
  { term: "Fidelidade partidária", text: "Quem tem mandato proporcional e troca de partido sem justa causa pode perder o mandato (Res. TSE 22.610/2007). Cargos majoritários não perdem (ADI 5.081)." },
  { term: "Fundo partidário", text: "Repasse mensal de dinheiro público aos partidos: 5% divididos igualmente e 95% na proporção dos votos para a Câmara (no jogo, aproximada pela bancada), só para quem cumpre a cláusula de desempenho." },
  { term: "Inelegibilidade", text: "Impedimento de disputar eleições por um período, por condenação, cassação ou outras causas da lei." },
  { term: "IPCA", text: "Índice de preços oficial do Brasil, medido pelo IBGE. No jogo, depois do ponto de partida, a inflação é simulada mês a mês." },
  { term: "Janela partidária", text: "Período de 30 dias que termina seis meses antes da eleição, em que deputados e vereadores em fim de mandato podem trocar de partido sem perder o cargo." },
  { term: "Justa causa", text: "Motivo aceito pela lei para trocar de partido sem perder o mandato: mudança do programa do partido, perseguição pessoal ou a janela partidária." },
  { term: "Lavagem de dinheiro", text: "Dar aparência legal a dinheiro de origem ilícita (Lei 9.613/1998)." },
  { term: "Prazo de filiação", text: "Quem quer disputar a eleição precisa estar filiado(a) a um partido até seis meses antes do 1º turno (até 2016, um ano antes)." },
  { term: "Prestígio interno", text: "Medida do jogo do seu peso dentro do partido. Pesa na escolha de candidatos nas convenções." },
  { term: "Quociente eleitoral", text: "Votos válidos divididos pelo número de cadeiras em disputa; base para distribuir as vagas das eleições proporcionais entre os partidos." },
  { term: "Rachadinha", text: "Apropriação de parte dos salários de assessores por quem os nomeou. Pode configurar peculato." },
  { term: "Registro de candidatura", text: "Pedido à Justiça Eleitoral, feito pelo partido depois da convenção, para que alguém possa aparecer na urna." },
  { term: "Relógio compartilhado", text: "Cada ponto de partida é um mundo só, para todos os jogadores. Quem passa o tempo passa para todos; com outros jogadores ativos, há um limite por hora e paradas antes de prazos e eleições." },
  { term: "Segundo turno", text: "Nova votação entre os dois mais votados quando ninguém passa de 50% dos votos válidos (presidente, governador e prefeito de cidades com mais de 200 mil eleitores)." },
  { term: "Selic", text: "Taxa básica de juros da economia, definida pelo Copom. No jogo, rende o dinheiro em conta e encarece as dívidas." },
  { term: "Snapshot", text: "A fotografia real do país no dia seguinte ao 2º turno escolhido. Depois dela, tudo é simulação." },
  { term: "Subsídio", text: "Remuneração mensal de quem exerce mandato. Depende do cargo e, para prefeitos e vereadores, do tamanho da cidade." },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

const BY_KEY = new Map(ENTRIES.map((e) => [norm(e.term), e]));
const ALIASES: Record<string, string> = {
  delacao: "colaboracao premiada",
  "delacao premiada": "colaboracao premiada",
  "fundo eleitoral": "fefc",
  "clausula de barreira": "clausula de desempenho",
  convencao: "convencao partidaria",
  convencoes: "convencao partidaria",
  "lei da ficha limpa": "ficha limpa",
  inflacao: "ipca",
  federacao: "federacao partidaria",
};

export const GLOSSARY: GlossaryEntry[] = [...ENTRIES].sort((a, b) => a.term.localeCompare(b.term, "pt-BR"));

export function glossaryEntry(key: string): GlossaryEntry | undefined {
  const k = norm(key);
  return BY_KEY.get(k) ?? BY_KEY.get(ALIASES[k] ?? "");
}
