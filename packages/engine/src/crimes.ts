import type { OfficeCode } from "./ruleset";

/**
 * Catálogo de condutas ilícitas da política brasileira, modeladas por RISCO e
 * EVIDÊNCIA. Cada entrada diz o que é, a base legal (que muda com a época),
 * quem tem oportunidade de praticar, o que rende, que rastro deixa, por onde
 * costuma ser descoberta e qual a consequência.
 *
 * Os textos descrevem o fato em nível de jornalismo e de processo, nunca como
 * instrução. Só jogadores e personagens fictícios praticam estas condutas; o
 * motor recusa pessoas reais (ver crime.ts e news/policy.ts).
 */
export type IllicitKind =
  | "CAIXA_DOIS"
  | "PROPINA"
  | "CORRUPCAO_ATIVA"
  | "PECULATO"
  | "RACHADINHA"
  | "FUNCIONARIO_FANTASMA"
  | "DESVIO_COTA"
  | "FRAUDE_LICITACAO"
  | "DESVIO_EMENDAS"
  | "LAVAGEM"
  | "COMPRA_VOTOS"
  | "ABUSO_PODER_ECONOMICO"
  | "USO_MAQUINA"
  | "DESINFORMACAO"
  | "CANDIDATURAS_LARANJA"
  | "DESVIO_FUNDO_PARTIDARIO"
  | "TRAFICO_INFLUENCIA"
  | "CONCUSSAO"
  | "NEPOTISMO"
  | "OBSTRUCAO_JUSTICA"
  | "ENRIQUECIMENTO_ILICITO";

/** Acusações que o processo pode somar aos atos (não são praticadas isoladamente). */
export type ChargeKind = IllicitKind | "ORGANIZACAO_CRIMINOSA";

/** Por onde um caso costuma chegar às autoridades. */
export type DetectionChannel =
  | "COAF"
  | "TRIBUNAL_CONTAS"
  | "IMPRENSA"
  | "MP_ELEITORAL"
  | "ADVERSARIO"
  | "EX_ASSESSOR"
  | "RECEITA"
  | "CONTROLADORIA"
  | "COLABORACAO";

export const CHANNEL_LABEL: Record<DetectionChannel, string> = {
  COAF: "relatório do Coaf sobre movimentação atípica",
  TRIBUNAL_CONTAS: "auditoria do Tribunal de Contas",
  IMPRENSA: "reportagem investigativa",
  MP_ELEITORAL: "fiscalização do Ministério Público Eleitoral",
  ADVERSARIO: "representação de adversário político",
  EX_ASSESSOR: "depoimento de ex-assessor",
  RECEITA: "cruzamento de dados da Receita Federal",
  CONTROLADORIA: "auditoria da Controladoria-Geral",
  COLABORACAO: "colaboração premiada de um envolvido",
};

export type Sphere = "PENAL" | "ELEITORAL" | "IMPROBIDADE";

export const SPHERE_LABEL: Record<Sphere, string> = {
  PENAL: "crime",
  ELEITORAL: "ilícito eleitoral",
  IMPROBIDADE: "improbidade administrativa",
};

export interface CrimePenalty {
  /** pena de prisão prevista, em anos [mín., máx.] (0 = sem prisão) */
  years: [number, number];
  /** multa proporcional ao valor envolvido */
  fineMult: number;
  /** cassação do mandato ou do registro */
  cassation: boolean;
  /** gera inelegibilidade (Ficha Limpa a partir de 2012) */
  ineligible: boolean;
}

export interface CrimeDef {
  kind: IllicitKind;
  /** nome curto ("Rachadinha") */
  label: string;
  /** o que é, em uma frase */
  summary: string;
  sphere: Sphere;
  /** base legal vigente no ano */
  law: (year: number) => string;
  /** como aparece numa manchete: "suspeita de {noun}" */
  noun: string;
  /** detalhe que a imprensa costuma revelar */
  hook: string;
  /** cargos em que há oportunidade (vazio = depende de outra condição) */
  offices: OfficeCode[];
  /** cúmplice típico (sempre um personagem fictício) */
  partnerRole: string[];
  /** rastro típico: documentos [mín., máx.] e testemunhas [mín., máx.] */
  trail: [number, number];
  witnesses: [number, number];
  /** canais de descoberta e o peso de cada um */
  channels: Partial<Record<DetectionChannel, number>>;
  penalty: CrimePenalty;
  /** o que um dossiê bem feito pode encontrar */
  findings: string[];
  /** diligências que aparecem na linha do tempo do caso */
  evidence: string[];
  /** esquema que se repete todo mês até ser encerrado */
  recurring?: boolean;
  /** só existe a partir deste ano */
  since?: number;
}

const LEGISLATIVE: OfficeCode[] = ["VEREADOR", "DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"];
const EXECUTIVE: OfficeCode[] = ["PREFEITO", "GOVERNADOR", "PRESIDENTE"];
const ALL_OFFICES: OfficeCode[] = [...LEGISLATIVE, ...EXECUTIVE];

const corruptionYears = (y: number): [number, number] => (y >= 2004 ? [2, 12] : [1, 8]);

export const CRIMES: Record<IllicitKind, CrimeDef> = {
  CAIXA_DOIS: {
    kind: "CAIXA_DOIS",
    label: "Caixa dois",
    summary: "Dinheiro de campanha que entra e sai sem aparecer na prestação de contas à Justiça Eleitoral.",
    sphere: "ELEITORAL",
    law: () => "Código Eleitoral, art. 350 (falsidade ideológica eleitoral)",
    noun: "caixa dois eleitoral",
    hook: "pagamentos de fornecedores da campanha não aparecem na prestação de contas",
    offices: [],
    partnerRole: ["empresário doador", "operador financeiro", "dono de gráfica"],
    trail: [0.2, 0.6],
    witnesses: [1, 5],
    channels: { MP_ELEITORAL: 3, IMPRENSA: 2, ADVERSARIO: 2, RECEITA: 1 },
    penalty: { years: [1, 5], fineMult: 1, cassation: true, ineligible: true },
    findings: [
      "Fornecedor da campanha emitiu notas que não constam da prestação de contas entregue ao TSE",
      "Gastos com cabos eleitorais superam em muito o valor declarado",
      "Doador aparece com repasses em dinheiro vivo a coordenadores da campanha",
      "Material de campanha foi impresso em quantidade três vezes maior que a declarada",
    ],
    evidence: [
      "Quebra do sigilo bancário da campanha",
      "Depoimento de fornecedor que prestou serviços sem nota",
      "Perícia compara a prestação de contas com o volume de material distribuído",
    ],
  },
  PROPINA: {
    kind: "PROPINA",
    label: "Corrupção passiva",
    summary: "Receber vantagem indevida em troca de um ato do cargo.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 317 (corrupção passiva)",
    noun: "recebimento de propina",
    hook: "empresa beneficiada fez repasses a pessoas próximas do político",
    offices: ALL_OFFICES,
    partnerRole: ["empresário da construção civil", "lobista do setor de serviços", "empresário do transporte"],
    trail: [0.2, 0.55],
    witnesses: [1, 4],
    channels: { COAF: 2, IMPRENSA: 2, COLABORACAO: 2, CONTROLADORIA: 1 },
    penalty: { years: [2, 12], fineMult: 2, cassation: false, ineligible: true },
    findings: [
      "Empresa que ganhou contratos fez transferências a uma consultoria ligada ao político",
      "Viagens e despesas pessoais foram pagas por um fornecedor do órgão",
      "Agenda oficial registra reuniões frequentes com a empresa beneficiada",
    ],
    evidence: [
      "Relatório de inteligência financeira aponta transferências fracionadas",
      "Mensagens apreendidas mencionam 'ajuda' combinada com a empresa",
      "Testemunha descreve entregas de dinheiro em espécie",
    ],
  },
  CORRUPCAO_ATIVA: {
    kind: "CORRUPCAO_ATIVA",
    label: "Corrupção ativa",
    summary: "Oferecer vantagem indevida a um agente público, como pagar parlamentares por apoio.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 333 (corrupção ativa)",
    noun: "pagamento de vantagem a parlamentares",
    hook: "parlamentares da base receberam repasses mensais em datas próximas a votações",
    offices: EXECUTIVE,
    partnerRole: ["operador financeiro", "tesoureiro informal"],
    trail: [0.3, 0.6],
    witnesses: [3, 9],
    channels: { COLABORACAO: 3, IMPRENSA: 2, COAF: 1 },
    penalty: { years: [2, 12], fineMult: 1.5, cassation: false, ineligible: true },
    findings: [
      "Saques em espécie coincidem com datas de votações importantes",
      "Parlamentares da base relatam ofertas em troca de apoio",
      "Um operador financeiro aparece pagando despesas de vários gabinetes",
    ],
    evidence: [
      "Quebra de sigilo mostra saques fracionados às vésperas de votações",
      "Ex-parlamentar descreve o esquema em depoimento",
      "Planilha apreendida lista pagamentos por nome e mês",
    ],
  },
  PECULATO: {
    kind: "PECULATO",
    label: "Peculato",
    summary: "Desviar dinheiro ou bens públicos que estão sob a responsabilidade do cargo.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 312 (peculato)",
    noun: "desvio de recursos públicos",
    hook: "pagamentos por serviços que nunca foram prestados",
    offices: EXECUTIVE,
    partnerRole: ["secretário de confiança", "empresário de fachada"],
    trail: [0.3, 0.7],
    witnesses: [1, 5],
    channels: { TRIBUNAL_CONTAS: 3, CONTROLADORIA: 2, IMPRENSA: 1 },
    penalty: { years: [2, 12], fineMult: 2, cassation: false, ineligible: true },
    findings: [
      "Contratos pagos não têm comprovação de entrega do serviço",
      "Empresa contratada funciona num endereço residencial e não tem funcionários",
      "Pagamentos foram liberados antes da medição da obra",
    ],
    evidence: [
      "Auditoria do Tribunal de Contas aponta pagamentos sem lastro",
      "Perícia em notas fiscais identifica numeração sequencial suspeita",
      "Servidor da área financeira presta depoimento",
    ],
  },
  RACHADINHA: {
    kind: "RACHADINHA",
    label: "Rachadinha",
    summary: "Exigir que assessores devolvam parte do salário pago com dinheiro público.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 312 (peculato)",
    noun: "devolução de salários de assessores (rachadinha)",
    hook: "ex-assessores relatam que devolviam parte do salário todo mês",
    offices: LEGISLATIVE,
    partnerRole: ["chefe de gabinete", "assessor de confiança"],
    trail: [0.25, 0.55],
    witnesses: [3, 10],
    channels: { EX_ASSESSOR: 3, COAF: 2, IMPRENSA: 2 },
    penalty: { years: [2, 12], fineMult: 1.5, cassation: false, ineligible: true },
    recurring: true,
    findings: [
      "Assessores sacam a maior parte do salário em espécie no dia do pagamento",
      "Um mesmo intermediário recebe depósitos de vários funcionários do gabinete",
      "Ex-assessora afirma que entregava metade do salário ao chefe de gabinete",
    ],
    evidence: [
      "Coaf identifica depósitos fracionados na conta do chefe de gabinete",
      "Ex-assessores confirmam o esquema em depoimento",
      "Quebra de sigilo mostra saques no dia do pagamento",
    ],
  },
  FUNCIONARIO_FANTASMA: {
    kind: "FUNCIONARIO_FANTASMA",
    label: "Funcionário fantasma",
    summary: "Nomear para cargo público alguém que recebe sem trabalhar.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 312 (peculato) e Lei 8.429/92 (improbidade)",
    noun: "nomeação de funcionários fantasmas",
    hook: "funcionários nomeados nunca foram vistos no local de trabalho",
    offices: ALL_OFFICES,
    partnerRole: ["parente de aliado", "cabo eleitoral"],
    trail: [0.3, 0.6],
    witnesses: [2, 6],
    channels: { IMPRENSA: 3, CONTROLADORIA: 1, EX_ASSESSOR: 2 },
    penalty: { years: [2, 12], fineMult: 1, cassation: false, ineligible: true },
    recurring: true,
    findings: [
      "Servidora nomeada no gabinete trabalha em período integral numa loja de outra cidade",
      "Registro de ponto de assessores é preenchido sempre pela mesma pessoa",
      "Funcionário lotado no gabinete mora em outro estado",
    ],
    evidence: [
      "Reportagem flagra servidor em outro emprego no horário de expediente",
      "Controladoria cruza a folha com outros vínculos",
      "Colegas de gabinete afirmam não conhecer o servidor",
    ],
  },
  DESVIO_COTA: {
    kind: "DESVIO_COTA",
    label: "Desvio da cota parlamentar",
    summary: "Usar notas frias para receber reembolso da cota de despesas do mandato.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 312 (peculato)",
    noun: "uso irregular da cota parlamentar",
    hook: "empresa que recebeu reembolsos da cota não tem sede nem funcionários",
    offices: ["DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"],
    partnerRole: ["dono de locadora de veículos", "dono de gráfica"],
    trail: [0.4, 0.7],
    witnesses: [1, 3],
    channels: { IMPRENSA: 3, CONTROLADORIA: 1, RECEITA: 1 },
    penalty: { years: [2, 12], fineMult: 1.5, cassation: false, ineligible: true },
    recurring: true,
    findings: [
      "Locadora que recebe reembolsos da cota tem um único carro registrado",
      "Notas de combustível somam quilometragem impossível para o período",
      "Gráfica que emite as notas fica no mesmo endereço do escritório político",
    ],
    evidence: [
      "Receita Federal aponta empresas sem capacidade operacional",
      "Perícia nas notas fiscais da cota",
      "Proprietário da empresa presta depoimento",
    ],
  },
  FRAUDE_LICITACAO: {
    kind: "FRAUDE_LICITACAO",
    label: "Fraude em licitação",
    summary: "Direcionar uma licitação para uma empresa combinada, normalmente com preço inflado.",
    sphere: "PENAL",
    law: (y) => (y >= 2021 ? "Código Penal, art. 337-F (frustração do caráter competitivo, Lei 14.133/2021)" : "Lei 8.666/93, art. 90 (fraude ao caráter competitivo)"),
    noun: "direcionamento de licitação",
    hook: "empresas concorrentes têm os mesmos sócios e propostas com os mesmos erros de digitação",
    offices: EXECUTIVE,
    partnerRole: ["empresário da construção civil", "empresário de serviços de limpeza", "fornecedor de merenda"],
    trail: [0.35, 0.75],
    witnesses: [2, 6],
    channels: { TRIBUNAL_CONTAS: 3, CONTROLADORIA: 2, IMPRENSA: 2, ADVERSARIO: 1 },
    penalty: { years: [4, 8], fineMult: 2, cassation: false, ineligible: true },
    findings: [
      "Três empresas concorrentes têm o mesmo contador e propostas com erros idênticos",
      "Edital exigia certificação que só uma empresa do estado possuía",
      "Preço contratado ficou 40% acima da tabela de referência",
    ],
    evidence: [
      "Tribunal de Contas aponta sobrepreço no contrato",
      "Perícia identifica autoria comum das propostas concorrentes",
      "Busca e apreensão na sede da empresa vencedora",
    ],
  },
  DESVIO_EMENDAS: {
    kind: "DESVIO_EMENDAS",
    label: "Desvio de emendas",
    summary: "Mandar emendas para um município ou entidade e receber de volta parte do dinheiro.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 312 (peculato) e Lei 9.613/98 (lavagem)",
    noun: "desvio de emendas parlamentares",
    hook: "entidade que recebeu a emenda subcontratou uma empresa ligada ao gabinete",
    offices: ["DEP_ESTADUAL", "DEP_FEDERAL", "SENADOR"],
    partnerRole: ["dirigente de ONG de fachada", "empresário de obras municipais"],
    trail: [0.35, 0.7],
    witnesses: [2, 6],
    channels: { CONTROLADORIA: 3, TRIBUNAL_CONTAS: 2, IMPRENSA: 2 },
    penalty: { years: [2, 12], fineMult: 2, cassation: false, ineligible: true },
    findings: [
      "Entidade beneficiada pela emenda foi criada um mês antes do repasse",
      "Obra paga com a emenda está inacabada e recebeu 90% do valor",
      "Empresa subcontratada fez transferências a assessor do parlamentar",
    ],
    evidence: [
      "Controladoria vistoria a obra e encontra serviço não executado",
      "Quebra de sigilo da entidade beneficiada",
      "Dirigente da entidade presta depoimento",
    ],
  },
  LAVAGEM: {
    kind: "LAVAGEM",
    label: "Lavagem de dinheiro",
    summary: "Dar aparência legal a dinheiro de origem ilícita.",
    sphere: "PENAL",
    law: () => "Lei 9.613/98, art. 1º (lavagem de dinheiro)",
    noun: "lavagem de dinheiro",
    hook: "empresa com faturamento milionário não tem clientes conhecidos",
    offices: [],
    partnerRole: ["doleiro", "dono de empresa de fachada", "operador financeiro"],
    trail: [0.3, 0.65],
    witnesses: [1, 3],
    channels: { COAF: 4, RECEITA: 2, COLABORACAO: 1 },
    penalty: { years: [3, 10], fineMult: 1.5, cassation: false, ineligible: true },
    findings: [
      "Patrimônio declarado cresceu muito mais que a renda no período",
      "Empresa em nome de terceiro movimenta valores incompatíveis com o faturamento",
      "Compra de imóveis foi paga com transferências de várias contas diferentes",
    ],
    evidence: [
      "Coaf comunica movimentações atípicas",
      "Receita Federal aponta variação patrimonial a descoberto",
      "Bloqueio de bens determinado pela Justiça",
    ],
  },
  COMPRA_VOTOS: {
    kind: "COMPRA_VOTOS",
    label: "Compra de votos",
    summary: "Oferecer dinheiro, bens ou vantagens ao eleitor em troca do voto.",
    sphere: "ELEITORAL",
    law: () => "Código Eleitoral, art. 299, e Lei 9.504/97, art. 41-A (cassação)",
    noun: "compra de votos",
    hook: "eleitores relatam ter recebido dinheiro e cestas básicas em troca do voto",
    offices: [],
    partnerRole: ["cabo eleitoral", "liderança comunitária"],
    trail: [0.15, 0.45],
    witnesses: [5, 15],
    channels: { MP_ELEITORAL: 4, ADVERSARIO: 3, IMPRENSA: 1 },
    penalty: { years: [0, 4], fineMult: 1, cassation: true, ineligible: true },
    findings: [
      "Eleitores gravaram cabos eleitorais oferecendo dinheiro na véspera da eleição",
      "Lista com nomes de eleitores e valores foi encontrada num comitê",
      "Distribuição de cestas básicas foi concentrada nos bairros de maior votação",
    ],
    evidence: [
      "Polícia apreende dinheiro e listas de eleitores com cabos eleitorais",
      "Eleitores prestam depoimento ao Ministério Público Eleitoral",
      "Ação de investigação judicial eleitoral é proposta",
    ],
  },
  ABUSO_PODER_ECONOMICO: {
    kind: "ABUSO_PODER_ECONOMICO",
    label: "Abuso de poder econômico",
    summary: "Gastar muito acima do limite legal para desequilibrar a disputa.",
    sphere: "ELEITORAL",
    law: () => "Lei Complementar 64/90, art. 22 (ação de investigação judicial eleitoral)",
    noun: "abuso de poder econômico na campanha",
    hook: "estrutura da campanha é muito maior do que o gasto declarado permitiria",
    offices: [],
    partnerRole: ["empresário doador", "coordenador financeiro da campanha"],
    trail: [0.3, 0.6],
    witnesses: [3, 8],
    channels: { MP_ELEITORAL: 3, ADVERSARIO: 3, IMPRENSA: 1 },
    penalty: { years: [0, 0], fineMult: 1, cassation: true, ineligible: true },
    findings: [
      "Frota de veículos da campanha é o triplo da declarada",
      "Eventos com shows gratuitos não aparecem na prestação de contas",
      "Gasto real estimado supera o teto legal para o cargo",
    ],
    evidence: [
      "Ministério Público Eleitoral pede a cassação do registro",
      "Perícia estima o gasto real da campanha",
      "Fornecedores confirmam pagamentos por fora",
    ],
  },
  USO_MAQUINA: {
    kind: "USO_MAQUINA",
    label: "Uso da máquina pública",
    summary: "Usar servidores, bens ou programas do governo em benefício da própria campanha.",
    sphere: "ELEITORAL",
    law: () => "Lei 9.504/97, art. 73 (condutas vedadas), e LC 64/90, art. 22",
    noun: "uso da máquina pública na campanha",
    hook: "servidores foram convocados em horário de expediente para atos de campanha",
    offices: EXECUTIVE,
    partnerRole: ["secretário de comunicação", "coordenador de programa social"],
    trail: [0.3, 0.6],
    witnesses: [4, 12],
    channels: { MP_ELEITORAL: 3, ADVERSARIO: 3, IMPRENSA: 2 },
    penalty: { years: [0, 0], fineMult: 1, cassation: true, ineligible: true },
    findings: [
      "Programa social teve inscrições ampliadas às vésperas da eleição",
      "Carros oficiais foram fotografados em carreatas",
      "Servidores receberam mensagens convocando para atos de campanha",
    ],
    evidence: [
      "Representação por conduta vedada é apresentada",
      "Servidores confirmam convocações em depoimento",
      "Registros dos carros oficiais são analisados",
    ],
  },
  DESINFORMACAO: {
    kind: "DESINFORMACAO",
    label: "Desinformação eleitoral",
    summary: "Divulgar fatos sabidamente falsos sobre adversários para influenciar o eleitor.",
    sphere: "ELEITORAL",
    law: () => "Código Eleitoral, art. 323 (divulgação de fatos sabidamente inverídicos)",
    noun: "disseminação de desinformação",
    hook: "perfis automatizados ligados à campanha espalharam conteúdo falso",
    offices: [],
    partnerRole: ["agência de marketing digital", "operador de redes"],
    trail: [0.3, 0.7],
    witnesses: [1, 4],
    channels: { ADVERSARIO: 3, MP_ELEITORAL: 2, IMPRENSA: 2 },
    penalty: { years: [0, 1], fineMult: 1, cassation: false, ineligible: false },
    findings: [
      "Rede de perfis criados no mesmo dia compartilhou o boato em sequência",
      "Agência contratada pela campanha administra os perfis que espalharam o conteúdo",
    ],
    evidence: [
      "Plataformas entregam dados dos perfis à Justiça Eleitoral",
      "Perícia digital liga os perfis à agência contratada",
    ],
  },
  CANDIDATURAS_LARANJA: {
    kind: "CANDIDATURAS_LARANJA",
    label: "Candidaturas laranjas",
    summary: "Registrar candidaturas de fachada para cumprir a cota de gênero e desviar o fundo eleitoral.",
    sphere: "ELEITORAL",
    law: () => "Lei 9.504/97, art. 10, §3º (cota de gênero), e Código Eleitoral, art. 350",
    noun: "candidaturas laranjas",
    hook: "candidatas receberam fundo eleitoral e tiveram votação quase nula",
    offices: [],
    partnerRole: ["candidata de fachada", "tesoureiro do partido"],
    trail: [0.35, 0.65],
    witnesses: [2, 6],
    channels: { MP_ELEITORAL: 3, IMPRENSA: 3, ADVERSARIO: 1 },
    penalty: { years: [1, 5], fineMult: 1, cassation: true, ineligible: true },
    findings: [
      "Candidatas que receberam o fundo eleitoral tiveram menos de dez votos",
      "Gráfica de um dirigente partidário recebeu a maior parte do dinheiro dessas candidaturas",
      "Candidata afirma que nunca fez campanha e foi registrada a pedido do partido",
    ],
    evidence: [
      "Ministério Público Eleitoral cruza votação e repasses do fundo",
      "Candidatas prestam depoimento",
      "Quebra de sigilo da gráfica beneficiada",
    ],
  },
  DESVIO_FUNDO_PARTIDARIO: {
    kind: "DESVIO_FUNDO_PARTIDARIO",
    label: "Desvio do fundo partidário",
    summary: "Usar dinheiro do partido, que vem de recursos públicos, para fins pessoais.",
    sphere: "PENAL",
    law: () => "Lei 9.096/95, art. 37 (contas partidárias), e Código Penal, art. 168",
    noun: "uso irregular do fundo partidário",
    hook: "contas do partido registram gastos pessoais de dirigentes",
    offices: [],
    partnerRole: ["tesoureiro do partido", "fornecedor do partido"],
    trail: [0.4, 0.7],
    witnesses: [1, 4],
    channels: { TRIBUNAL_CONTAS: 1, MP_ELEITORAL: 2, IMPRENSA: 2, ADVERSARIO: 1 },
    penalty: { years: [1, 4], fineMult: 1.5, cassation: false, ineligible: false },
    findings: [
      "Prestação de contas do partido inclui aluguel de imóvel usado como residência de dirigente",
      "Fornecedor do partido é empresa de parente do presidente da legenda",
      "Despesas com 'consultoria' não têm nenhum produto entregue",
    ],
    evidence: [
      "Justiça Eleitoral desaprova as contas do partido",
      "Perícia nas notas fiscais da legenda",
      "Ex-tesoureiro presta depoimento",
    ],
  },
  TRAFICO_INFLUENCIA: {
    kind: "TRAFICO_INFLUENCIA",
    label: "Tráfico de influência",
    summary: "Cobrar para prometer influência sobre uma decisão de agente público.",
    sphere: "PENAL",
    law: () => "Código Penal, art. 332 (tráfico de influência)",
    noun: "venda de acesso a autoridades",
    hook: "empresários pagaram 'consultoria' para conseguir reuniões e decisões favoráveis",
    offices: [],
    partnerRole: ["lobista", "empresário interessado"],
    trail: [0.25, 0.55],
    witnesses: [1, 3],
    channels: { IMPRENSA: 2, COLABORACAO: 2, COAF: 1 },
    penalty: { years: [2, 5], fineMult: 1, cassation: false, ineligible: true },
    findings: [
      "Consultoria sem funcionários recebeu pagamentos de empresas com interesses no governo",
      "Empresário afirma que pagou para conseguir uma reunião com autoridades",
    ],
    evidence: [
      "Contratos de consultoria são apreendidos",
      "Empresários prestam depoimento",
    ],
  },
  CONCUSSAO: {
    kind: "CONCUSSAO",
    label: "Concussão",
    summary: "Exigir vantagem indevida usando o poder do cargo.",
    sphere: "PENAL",
    law: (y) => (y >= 2020 ? "Código Penal, art. 316 (concussão; pena ampliada pela Lei 13.964/2019)" : "Código Penal, art. 316 (concussão)"),
    noun: "cobrança de vantagem indevida de empresários",
    hook: "empresários dizem que foram pressionados a pagar para receber o que tinham a receber",
    offices: ALL_OFFICES,
    partnerRole: ["secretário de confiança", "fiscal aliado"],
    trail: [0.2, 0.5],
    witnesses: [2, 6],
    channels: { IMPRENSA: 2, ADVERSARIO: 1, COLABORACAO: 2 },
    penalty: { years: [2, 12], fineMult: 1.5, cassation: false, ineligible: true },
    findings: [
      "Fornecedores relatam atraso proposital de pagamentos até aceitarem 'acertos'",
      "Gravação mostra intermediário cobrando percentual sobre o contrato",
    ],
    evidence: [
      "Empresários prestam depoimento",
      "Gravação entregue ao Ministério Público é periciada",
    ],
  },
  NEPOTISMO: {
    kind: "NEPOTISMO",
    label: "Nepotismo",
    summary: "Nomear parentes para cargos de confiança.",
    sphere: "IMPROBIDADE",
    law: (y) => (y >= 2008 ? "Súmula Vinculante 13 do STF e Lei 8.429/92 (improbidade)" : "Lei 8.429/92 (improbidade administrativa)"),
    noun: "nomeação de parentes",
    hook: "parentes do político ocupam cargos de confiança em órgãos aliados",
    offices: ALL_OFFICES,
    partnerRole: ["parente nomeado"],
    trail: [0.5, 0.8],
    witnesses: [1, 3],
    channels: { IMPRENSA: 3, CONTROLADORIA: 1, ADVERSARIO: 1 },
    penalty: { years: [0, 0], fineMult: 0.5, cassation: false, ineligible: false },
    findings: [
      "Cunhado e sobrinha do político estão nomeados em cargos de confiança",
      "Nomeações cruzadas: parentes de dois políticos aliados trabalham um no gabinete do outro",
    ],
    evidence: [
      "Diário oficial registra as nomeações",
      "Ação civil pública por improbidade é proposta",
    ],
  },
  OBSTRUCAO_JUSTICA: {
    kind: "OBSTRUCAO_JUSTICA",
    label: "Obstrução de justiça",
    summary: "Atrapalhar uma investigação, como pressionar testemunhas ou destruir provas.",
    sphere: "PENAL",
    law: (y) => (y >= 2013 ? "Lei 12.850/2013, art. 2º, §1º (embaraço à investigação)" : "Código Penal, art. 344 (coação no curso do processo)"),
    noun: "tentativa de atrapalhar as investigações",
    hook: "testemunhas relatam terem sido procuradas por emissários do investigado",
    offices: [],
    partnerRole: ["advogado do esquema", "emissário"],
    trail: [0.3, 0.6],
    witnesses: [1, 4],
    channels: { COLABORACAO: 2, IMPRENSA: 1 },
    penalty: { years: [3, 8], fineMult: 0.5, cassation: false, ineligible: true },
    findings: ["Testemunha relata ter sido procurada para mudar o depoimento"],
    evidence: ["Testemunha relata pressão e pede proteção", "Polícia pede a prisão preventiva por risco à investigação"],
  },
  ENRIQUECIMENTO_ILICITO: {
    kind: "ENRIQUECIMENTO_ILICITO",
    label: "Enriquecimento ilícito",
    summary: "Patrimônio que cresce sem explicação pela renda declarada.",
    sphere: "IMPROBIDADE",
    law: () => "Lei 8.429/92, art. 9º (improbidade por enriquecimento ilícito)",
    noun: "enriquecimento incompatível com a renda",
    hook: "patrimônio declarado multiplicou durante o mandato",
    offices: [],
    partnerRole: ["laranja"],
    trail: [0.5, 0.8],
    witnesses: [0, 2],
    channels: { RECEITA: 3, COAF: 2, IMPRENSA: 1 },
    penalty: { years: [0, 0], fineMult: 1, cassation: false, ineligible: true },
    findings: ["Imóveis em nome de parentes foram comprados à vista durante o mandato"],
    evidence: ["Receita Federal aponta variação patrimonial a descoberto", "Bens são bloqueados pela Justiça"],
  },
};

export const CHARGE_LABEL: Record<ChargeKind, string> = {
  ...(Object.fromEntries(Object.values(CRIMES).map((c) => [c.kind, c.label])) as Record<IllicitKind, string>),
  ORGANIZACAO_CRIMINOSA: "Organização criminosa",
};

export function chargeLaw(kind: ChargeKind, year: number): string {
  if (kind === "ORGANIZACAO_CRIMINOSA") return year >= 2013 ? "Lei 12.850/2013, art. 2º (organização criminosa)" : "Código Penal, art. 288 (quadrilha ou bando)";
  return CRIMES[kind].law(year);
}

export function chargeLabel(kind: ChargeKind, year: number): string {
  if (kind === "ORGANIZACAO_CRIMINOSA" && year < 2013) return "Formação de quadrilha";
  return CHARGE_LABEL[kind];
}

/** Pena prevista para a conduta no ano (corrupção teve a pena aumentada em 2003). */
export function penaltyYears(kind: ChargeKind, year: number): [number, number] {
  if (kind === "ORGANIZACAO_CRIMINOSA") return year >= 2013 ? [3, 8] : [1, 3];
  if (kind === "PROPINA" || kind === "CORRUPCAO_ATIVA") return corruptionYears(year);
  if (kind === "CONCUSSAO") return year >= 2020 ? [2, 12] : [2, 8];
  if (kind === "FRAUDE_LICITACAO") return year >= 2021 ? [4, 8] : [2, 4];
  return CRIMES[kind].penalty.years;
}

/** Nome do ato no plural para manchetes que juntam várias condutas. */
export function chargesText(kinds: ChargeKind[]): string {
  const nouns = [...new Set(kinds)].map((k) => (k === "ORGANIZACAO_CRIMINOSA" ? "organização criminosa" : CRIMES[k].noun));
  if (!nouns.length) return "irregularidades";
  if (nouns.length === 1) return nouns[0];
  return `${nouns.slice(0, -1).join(", ")} e ${nouns[nouns.length - 1]}`;
}
