import type { ClaimType } from "./policy";

export interface NewsTemplate {
  category: string;
  claims: ClaimType[];
  importance: 1 | 2 | 3;
  variants: Array<{ h: string; b: string }>;
}

/**
 * Templates de notícia. Placeholders entre chaves são preenchidos com fatos
 * estruturados vindos do motor. Templates nunca inventam fatos novos.
 */
export const TEMPLATES: Record<string, NewsTemplate> = {
  SNAPSHOT_RESULT: {
    category: "eleicoes",
    claims: ["FACTUAL_RESULT"],
    importance: 3,
    variants: [
      {
        h: "{name} ({party}) vence o 2º turno e é eleito para a Presidência",
        b: "Segundo o Tribunal Superior Eleitoral, {name} venceu o segundo turno das Eleições {year} com {votes} votos ({share}% dos válidos), contra {rivalVotes} votos ({rivalShare}%) de {rival}. Este é o último fato real do snapshot histórico; a partir daqui, o mundo segue uma linha do tempo alternativa. Fonte: {source}.",
      },
    ],
  },
  SNAPSHOT_GOVERNOR: {
    category: "eleicoes",
    claims: ["FACTUAL_RESULT"],
    importance: 2,
    variants: [
      { h: "{name} ({party}) é eleito governador em {uf} no 2º turno", b: "Segundo o TSE, {name} venceu o segundo turno com {votes} votos ({share}% dos válidos). Fato real do snapshot de 2026." },
    ],
  },
  WORLD_INTRO: {
    category: "politica",
    claims: [],
    importance: 2,
    variants: [
      { h: "Transição política ganha ritmo após a eleição", b: "Com o resultado do segundo turno definido, partidos começam a recalcular estratégias para 2028. Dirigentes falam em renovação de quadros e disputa por diretórios estaduais." },
      { h: "Congresso articula novas alianças para o próximo biênio", b: "Lideranças partidárias iniciam conversas sobre a composição das mesas e a distribuição de comissões. Bancadas médias tentam se posicionar como fiel da balança." },
      { h: "Mercado revisa expectativas para 2027", b: "Analistas ajustam projeções de crescimento, inflação e juros diante do novo cenário político. A taxa Selic começa o período em {selic}% ao ano." },
    ],
  },
  ECON_MONTHLY: {
    category: "economia",
    claims: [],
    importance: 1,
    variants: [
      { h: "Inflação em 12 meses fica em {inflation}%; desemprego vai a {unemployment}%", b: "Os indicadores de {month} mostram atividade crescendo a um ritmo anualizado de {growth}%. A dívida bruta está em {debt}% do PIB e o índice de confiança, em {confidence} pontos." },
      { h: "Economia cresce {growth}% em ritmo anual; inflação está em {inflation}%", b: "O retrato de {month} combina desemprego de {unemployment}% e juros básicos de {selic}%. Economistas acompanham o efeito defasado da política monetária sobre a atividade." },
    ],
  },
  COPOM_DECISION: {
    category: "economia",
    claims: [],
    importance: 2,
    variants: [
      { h: "Copom {verb} a Selic {prep} {selic}% ao ano", b: "O Comitê de Política Monetária do Banco Central decidiu {decision}. O comunicado cita inflação de {inflation}% em 12 meses e expectativas em {expectations}%." },
    ],
  },
  ECON_SHOCK: {
    category: "economia",
    claims: [],
    importance: 2,
    variants: [{ h: "{title}", b: "{body}" }],
  },
  GOV_APPROVAL: {
    category: "governo",
    claims: [],
    importance: 1,
    variants: [
      { h: "Aprovação do governo federal fica em {approval}%", b: "Levantamento do {institute} indica que {approval}% avaliam a gestão federal como ótima ou boa. Economia e segurança seguem como as maiores preocupações do eleitorado." },
    ],
  },
  GOV_FISCAL: {
    category: "governo",
    claims: [],
    importance: 1,
    variants: [
      { h: "Equipe econômica {fiscalVerb}", b: "Documentos da equipe econômica indicam que a orientação fiscal do governo federal para os próximos meses será {fiscalLabel}. O mercado reagiu com {marketReaction}." },
    ],
  },
  AFFILIATION_ACCEPTED: {
    category: "partidos",
    claims: ["FACTUAL_PARTY"],
    importance: 1,
    variants: [
      { h: "{party} aprova filiação de {name} em {uf}", b: "O diretório estadual do {party} aprovou o pedido de filiação de {name}, que atua em {municipality}. Dirigentes citaram {reasonText}." },
      { h: "{name} se filia ao {party}", b: "Após avaliação do diretório, {name} passa a integrar os quadros do {party} em {uf}. A legenda busca reforçar sua presença em {municipality}." },
    ],
  },
  AFFILIATION_REJECTED: {
    category: "partidos",
    claims: [],
    importance: 1,
    variants: [
      { h: "Diretório do {party} em {uf} recusa novos pedidos de filiação", b: "O {party} informou que alguns pedidos de filiação recebidos neste mês não foram aprovados. Segundo a direção, a legenda prioriza {priority}." },
    ],
  },
  PARTY_INVITATION: {
    category: "partidos",
    claims: [],
    importance: 1,
    variants: [
      { h: "{party} tenta atrair novos nomes em {uf}", b: "Dirigentes do {party} intensificaram conversas com lideranças locais em {municipality}. A legenda quer ampliar sua base antes do prazo de filiação." },
    ],
  },
  NPC_PARTY_SWITCH: {
    category: "partidos",
    claims: ["SIMULATED_POLITICAL_MOVE"],
    importance: 2,
    variants: [
      { h: "Janela partidária: {name} troca {fromParty} pelo {toParty}", b: "Na linha do tempo simulada, {name} ({uf}) deixa o {fromParty} e se filia ao {toParty} durante a janela partidária. Com a mudança, o {toParty} amplia sua presença em {uf}." },
      { h: "{name} se filia ao {toParty} na janela partidária", b: "A mudança, ocorrida na simulação, reforça o {toParty} em {uf}. Até aqui, {name} integrava o {fromParty}." },
    ],
  },
  NPC_PROPOSAL: {
    category: "politica",
    claims: ["FICTIONAL_PROPOSAL", "QUOTE"],
    importance: 1,
    variants: [
      { h: "{name} ({party}) defende {proposal}", b: "Em evento em {uf}, {name} afirmou: \"{quote}\" A proposta deve enfrentar resistência de setores que defendem {opposite}." },
      { h: "{party} lança proposta: {proposal}", b: "A iniciativa foi apresentada por {name}, que disse a apoiadores: \"{quote}\"" },
    ],
  },
  FACTION_DISPUTE: {
    category: "partidos",
    claims: ["POLITICAL_BETRAYAL"],
    importance: 1,
    variants: [
      { h: "Disputa interna no {party}: ala {faction} ganha espaço", b: "A ala {faction} ampliou sua influência sobre o diretório nacional do {party}. Aliados da corrente reivindicam prioridade na distribuição de recursos para {year}." },
    ],
  },
  NEW_FACE: {
    category: "partidos",
    claims: [],
    importance: 1,
    variants: [
      { h: "{party} aposta em {name} para renovar quadros em {uf}", b: "{name}, {age} anos, {profession}, passa a ser apontado como nome promissor da legenda em {uf}." },
    ],
  },
  NPC_RETIREMENT: {
    category: "politica",
    claims: ["RETIREMENT_NEUTRAL"],
    importance: 1,
    variants: [
      { h: "{name} anuncia afastamento da vida pública", b: "{name}, que atuou pelo {party} em {uf}, não participará mais da vida política nesta linha do tempo simulada." },
    ],
  },
  REAL_RETIREMENT: {
    category: "politica",
    claims: ["RETIREMENT_NEUTRAL"],
    importance: 2,
    variants: [
      { h: "Encerramento de ciclo", b: "{name} não participa mais da vida política nesta linha do tempo simulada." },
    ],
  },
  ELECTION_CALENDAR: {
    category: "eleicoes",
    claims: [],
    importance: 2,
    variants: [{ h: "{title}", b: "{body}" }],
  },
  CONVENTION_RESULT: {
    category: "eleicoes",
    claims: ["SIMULATED_POLITICAL_MOVE"],
    importance: 2,
    variants: [
      { h: "{party} oficializa {name} na disputa para {office} em {geoName}", b: "A convenção do {party} confirmou a candidatura. {name} {extra}" },
    ],
  },
  POLL_RELEASE: {
    category: "pesquisas",
    claims: ["SIMULATED_PERFORMANCE"],
    importance: 2,
    variants: [
      { h: "{institute}: {leader} lidera disputa para {office} em {geoName} com {leaderPct}%", b: "Na pesquisa divulgada hoje, {leader} ({leaderParty}) aparece com {leaderPct}%, seguido de {second} ({secondParty}) com {secondPct}%. Indecisos somam {undecided}%. A margem de erro é de {margin} pontos para mais ou para menos." },
    ],
  },
  DEBATE_RESULT: {
    category: "debates",
    claims: ["SIMULATED_PERFORMANCE"],
    importance: 2,
    variants: [
      { h: "Debate da {outlet}: {winner} se destaca na disputa por {office} em {geoName}", b: "No confronto, {winner} teve a melhor avaliação entre os eleitores ouvidos após o programa. {loser} teve dificuldade nas réplicas. O tema mais citado foi {theme}." },
    ],
  },
  ELECTION_RESULT: {
    category: "eleicoes",
    claims: ["SIMULATED_PERFORMANCE"],
    importance: 3,
    variants: [
      { h: "{winner} ({winnerParty}) é eleito para {office} em {geoName}", b: "Com {winnerShare}% dos votos válidos, {winner} venceu a disputa. {runnerUp} ({runnerUpParty}) ficou com {runnerUpShare}%. Comparecimento: {turnout}%." },
    ],
  },
  RUNOFF_SET: {
    category: "eleicoes",
    claims: ["SIMULATED_PERFORMANCE"],
    importance: 3,
    variants: [
      { h: "{office} em {geoName}: {first} e {second} vão ao segundo turno", b: "{first} ({firstParty}) teve {firstShare}% dos válidos e {second} ({secondParty}), {secondShare}%. A votação final será em {runoffDate}." },
    ],
  },
  PROPORTIONAL_RESULT: {
    category: "eleicoes",
    claims: ["SIMULATED_PERFORMANCE"],
    importance: 2,
    variants: [
      { h: "{office} em {geoName}: {topParty} elege a maior bancada", b: "O {topParty} conquistou {topSeats} de {seats} cadeiras. {summary}" },
    ],
  },
  INAUGURATION: {
    category: "governo",
    claims: ["SIMULATED_POLITICAL_MOVE"],
    importance: 2,
    variants: [{ h: "{name} toma posse como {office} em {geoName}", b: "A posse marca o início do mandato que vai até {endDate}." }],
  },
  BILL_VOTE: {
    category: "congresso",
    claims: [],
    importance: 1,
    variants: [
      { h: "{chamber} {result} {title}", b: "O texto teve {yes} votos favoráveis e {no} contrários. {govNote}" },
    ],
  },
  POLICY_DONE: {
    category: "governo",
    claims: ["FICTIONAL_PROPOSAL"],
    importance: 1,
    variants: [{ h: "{title}: {status}", b: "{body}" }],
  },
  SCANDAL_STAGE: {
    category: "investigacao",
    claims: ["CORRUPTION"],
    importance: 3,
    variants: [{ h: "{title}", b: "{body}" }],
  },
  RUMOR: {
    category: "redes",
    claims: ["CORRUPTION"],
    importance: 1,
    variants: [
      { h: "Boato sobre {name} se espalha nas redes do mundo simulado", b: "Mensagens sem comprovação sobre {topic} circulam com apoio de perfis automatizados. Checadores ainda não confirmaram a informação." },
    ],
  },
  RUMOR_DEBUNKED: {
    category: "redes",
    claims: [],
    importance: 1,
    variants: [{ h: "Checagem desmente boato envolvendo {name}", b: "Agências de checagem concluíram que as mensagens sobre {topic} não tinham base factual." }],
  },
  CAREER_LOCAL: {
    category: "carreira",
    claims: [],
    importance: 1,
    variants: [{ h: "{title}", b: "{body}" }],
  },
  WORLD_EVENT: {
    category: "pais",
    claims: [],
    importance: 2,
    variants: [{ h: "{title}", b: "{body}" }],
  },
};
