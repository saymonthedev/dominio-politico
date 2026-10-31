import { addDays, type ISODate } from "./calendar";
import { UF_BY_CODE } from "./geo";
import { cityHousing, homeCityOf } from "./housing";
import type { Rng } from "./rng";
import type { OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { Proposal, ProposalKind, ProposalResult, ProposalStage } from "./story/types";
import type { PersonRow, PersonStateRow } from "./types";

/**
 * Propostas que chegam ao gabinete. Quem tem mandato recebe pedidos o tempo todo:
 * moradores, escolas, entidades, comerciantes, colegas, o próprio partido. O jogador
 * decide assinar, dividir com colegas, estudar ou recusar; o que é aceito anda por
 * etapas (comissão, plenário, sanção; ou estudo, licitação, obra e inauguração) e
 * cada etapa vira um acontecimento com escolha. No fim: lei aprovada, obra entregue,
 * indicação atendida — ou derrota. Tudo mexe na aprovação popular e na reputação.
 */

export type Scope = "MUNICIPAL" | "ESTADUAL" | "FEDERAL";

export interface ProposalTemplate {
  id: string;
  kind: ProposalKind;
  /** cargos que recebem esse pedido */
  offices: OfficeCode[];
  theme: string;
  segment: string;
  /** título com o lugar (bairro, cidade ou estado) */
  title: (place: string) => string;
  /** quem traz o pedido */
  from: (place: string) => string;
  /** o que dizem ao chegar */
  pitch: (place: string) => string;
  /** pontos de aprovação se der certo */
  impact: number;
  /** dificuldade (0 fácil – 1 muito difícil) */
  difficulty: number;
  /** quem não gosta (custa um pouco de aprovação já ao assinar) */
  polemic?: string;
}

const VER: OfficeCode[] = ["VEREADOR"];
const EST: OfficeCode[] = ["DEP_ESTADUAL"];
const FED: OfficeCode[] = ["DEP_FEDERAL", "SENADOR"];
const PREF: OfficeCode[] = ["PREFEITO"];
const GOV: OfficeCode[] = ["GOVERNADOR"];
const PRES: OfficeCode[] = ["PRESIDENTE"];

export const PROPOSAL_TEMPLATES: ProposalTemplate[] = [
  // ------------------------------------------------------------- Câmara Municipal: indicações
  { id: "faixa_escola", kind: "INDICACAO", offices: VER, theme: "trânsito", segment: "classe_media", impact: 2.5, difficulty: 0.25,
    title: (h) => `Faixa elevada em frente à escola do ${h}`, from: (h) => `A diretora da escola municipal do ${h}`,
    pitch: (h) => `"Três crianças quase atropeladas este ano. Os carros descem a rua do ${h} sem frear." Ela traz um abaixo-assinado com 400 nomes.` },
  { id: "iluminacao", kind: "INDICACAO", offices: VER, theme: "segurança", segment: "trabalhadores_formais", impact: 2.5, difficulty: 0.3,
    title: (h) => `Iluminação nova na rua principal do ${h}`, from: (h) => `Moradores do ${h}`,
    pitch: (h) => `"Depois das sete da noite ninguém anda ali. Já teve assalto no ponto de ônibus." Pedem postes de LED no ${h}.` },
  { id: "buraco", kind: "INDICACAO", offices: VER, theme: "infraestrutura", segment: "trabalhadores_formais", impact: 2, difficulty: 0.2,
    title: (h) => `Tapa-buraco e drenagem no ${h}`, from: (h) => `Um grupo de motoristas de aplicativo do ${h}`,
    pitch: (h) => `"Quando chove, a rua vira rio e o buraco come pneu." Mostram fotos de três carros no conserto.` },
  { id: "ubs_horario", kind: "INDICACAO", offices: VER, theme: "saúde", segment: "informais", impact: 3, difficulty: 0.45,
    title: (h) => `Posto de saúde do ${h} aberto até as 22h`, from: (h) => `Trabalhadoras do comércio do ${h}`,
    pitch: (h) => `"A gente sai do serviço e o posto já fechou. Pra consultar, tem que faltar e perder o dia."` },
  { id: "quadra", kind: "INDICACAO", offices: VER, theme: "esporte", segment: "jovens_urbanos", impact: 2.5, difficulty: 0.35,
    title: (h) => `Reforma da quadra de esportes do ${h}`, from: (h) => `O professor de futsal do projeto social do ${h}`,
    pitch: (h) => `"Sessenta meninos treinam numa quadra com alambrado caído. Se a quadra fechar, eles vão pra rua."` },
  { id: "rampa", kind: "INDICACAO", offices: VER, theme: "acessibilidade", segment: "aposentados", impact: 2, difficulty: 0.2,
    title: (h) => `Rampa de acessibilidade no posto e na praça do ${h}`, from: () => "Um cadeirante que te para na rua",
    pitch: () => `"Pra entrar no posto eu dependo de dois homens me carregarem. Isso é humilhante."` },
  { id: "onibus_linha", kind: "INDICACAO", offices: VER, theme: "transporte", segment: "trabalhadores_formais", impact: 3, difficulty: 0.5,
    title: (h) => `Mais horários de ônibus para o ${h}`, from: (h) => `A associação de moradores do ${h}`,
    pitch: (h) => `"O ônibus das seis vem lotado e o das sete não passa. Tem gente perdendo emprego por atraso."` },
  // ------------------------------------------------------------- Câmara Municipal: projetos
  { id: "castracao", kind: "PROJETO", offices: VER, theme: "causa animal", segment: "classe_media", impact: 2.5, difficulty: 0.4,
    title: () => "Programa municipal de castração gratuita de cães e gatos", from: () => "Protetoras de animais da cidade",
    pitch: () => `"Recolhemos mais bicho do que conseguimos doar. Castrar sai mais barato do que tratar abandono."` },
  { id: "feira", kind: "PROJETO", offices: VER, theme: "economia local", segment: "agro", impact: 2, difficulty: 0.3,
    title: () => "Feira do produtor rural aos sábados no centro", from: () => "A cooperativa de agricultores familiares",
    pitch: () => `"Vendemos para atravessador pela metade do preço. Com uma feira, o morador compra fresco e a gente vive."` },
  { id: "fogos", kind: "PROJETO", offices: VER, theme: "bem-estar", segment: "aposentados", impact: 2, difficulty: 0.5, polemic: "comerciantes de fogos e parte da torcida reclamaram",
    title: () => "Proibição de fogos com estampido na cidade", from: () => "Mães de crianças autistas e tutores de animais",
    pitch: () => `"No réveillon e em dia de jogo, meu filho passa a noite em crise." Trazem laudos e um vídeo que comove.` },
  { id: "passe_estudante", kind: "PROJETO", offices: VER, theme: "educação", segment: "jovens_urbanos", impact: 4, difficulty: 0.7, polemic: "as empresas de ônibus e a área econômica da prefeitura chiaram",
    title: () => "Passe livre para estudantes no transporte municipal", from: () => "O grêmio estudantil e o cursinho popular",
    pitch: () => `"Metade da turma falta porque não tem a passagem." Eles prometem lotar a galeria no dia da votação.` },
  { id: "horta", kind: "PROJETO", offices: VER, theme: "meio ambiente", segment: "classe_media", impact: 2, difficulty: 0.3,
    title: (h) => `Hortas comunitárias em terrenos baldios (começando pelo ${h})`, from: (h) => `Um grupo de vizinhas do ${h}`,
    pitch: (h) => `"Aquele terreno no ${h} vira lixão e criadouro de mosquito. Com horta, vira comida e encontro."` },
  { id: "cameras", kind: "PROJETO", offices: VER, theme: "segurança", segment: "classe_media", impact: 3, difficulty: 0.55,
    title: () => "Câmeras de monitoramento ligadas à guarda municipal", from: () => "A associação comercial",
    pitch: () => `"Foram cinco arrombamentos no centro este mês. Com câmera, o ladrão pensa duas vezes."` },
  { id: "titulo_cidadao", kind: "PROJETO", offices: VER, theme: "homenagem", segment: "trabalhadores_formais", impact: 1, difficulty: 0.15,
    title: () => "Título de cidadão honorário para a parteira mais antiga da cidade", from: () => "A família de dona Iracema",
    pitch: () => `"Ela ajudou a nascer meio bairro. Merece o reconhecimento em vida."` },
  { id: "app_regras", kind: "PROJETO", offices: VER, theme: "trabalho", segment: "informais", impact: 3, difficulty: 0.55, polemic: "taxistas acharam pouco; as plataformas acharam demais",
    title: () => "Regras para motoristas de aplicativo (pontos de apoio e segurança)", from: () => "Motoristas de aplicativo da cidade",
    pitch: () => `"A gente roda doze horas sem banheiro nem lugar pra parar. Só queremos um ponto de apoio e regra clara."` },
  // ------------------------------------------------------------- Assembleia Legislativa
  { id: "ipva_app", kind: "PROJETO", offices: EST, theme: "trabalho", segment: "informais", impact: 3, difficulty: 0.6, polemic: "a Fazenda estadual reclamou da perda de arrecadação",
    title: () => "Desconto no IPVA para motoristas de aplicativo e taxistas", from: () => "A associação estadual de motoristas",
    pitch: () => `"O carro é nossa ferramenta de trabalho. Pagamos IPVA como se fosse luxo."` },
  { id: "delegacia_mulher", kind: "INDICACAO", offices: EST, theme: "segurança", segment: "trabalhadores_formais", impact: 3, difficulty: 0.45,
    title: (h) => `Delegacia da Mulher 24 horas em ${h}`, from: (h) => `Um coletivo de mulheres de ${h}`,
    pitch: (h) => `"Em ${h}, quem apanha de madrugada tem que esperar até segunda pra registrar. Até lá, desiste."` },
  { id: "piso_professor", kind: "PROJETO", offices: EST, theme: "educação", segment: "trabalhadores_formais", impact: 4, difficulty: 0.7, polemic: "o governo do estado disse que não cabe no orçamento",
    title: () => "Reajuste do piso dos professores da rede estadual", from: () => "O sindicato dos professores",
    pitch: () => `"Professor com dois empregos não prepara aula. Queremos o piso cumprido e plano de carreira."` },
  { id: "hospital_regional", kind: "INDICACAO", offices: EST, theme: "saúde", segment: "aposentados", impact: 3.5, difficulty: 0.6,
    title: (h) => `Leitos de UTI no hospital regional de ${h}`, from: (h) => `Prefeitos e vereadores da região de ${h}`,
    pitch: (h) => `"Paciente grave de ${h} viaja três horas de ambulância. Muitos não chegam."` },
  { id: "estrada_vicinal", kind: "INDICACAO", offices: EST, theme: "infraestrutura", segment: "agro", impact: 3, difficulty: 0.5,
    title: (h) => `Asfalto na rodovia que liga ${h} à BR`, from: (h) => `Produtores rurais de ${h}`,
    pitch: () => `"Na chuva, o caminhão do leite atola e a produção estraga. Já perdemos uma safra inteira de frete."` },
  { id: "conta_luz", kind: "PROJETO", offices: EST, theme: "consumidor", segment: "informais", impact: 3, difficulty: 0.45,
    title: () => "Proibição de corte de luz e água às sextas e vésperas de feriado", from: () => "O Procon e associações de consumidores",
    pitch: () => `"Cortam na sexta e a família passa o fim de semana no escuro, sem poder pagar a religação."` },
  { id: "esporte_escola", kind: "PROJETO", offices: EST, theme: "esporte", segment: "jovens_urbanos", impact: 2.5, difficulty: 0.4,
    title: () => "Escolas estaduais abertas nos fins de semana para esporte e cultura", from: () => "Professores de educação física e líderes comunitários",
    pitch: () => `"A escola fecha sexta e o tráfico abre sábado. Vamos disputar esses meninos."` },
  // ------------------------------------------------------------- Câmara dos Deputados e Senado
  { id: "roubo_celular", kind: "PROJETO", offices: FED, theme: "segurança", segment: "classe_media", impact: 3, difficulty: 0.55, polemic: "juristas criticaram o aumento de pena como ineficaz",
    title: () => "Pena maior para roubo de celular e golpe por aplicativo", from: () => "Uma associação de vítimas de golpes digitais",
    pitch: () => `"Roubaram o celular e limparam a conta da minha mãe em dez minutos. O ladrão saiu no dia seguinte."` },
  { id: "primeiro_emprego", kind: "PROJETO", offices: FED, theme: "emprego", segment: "jovens_urbanos", impact: 3.5, difficulty: 0.6,
    title: () => "Incentivo fiscal para contratar jovens no primeiro emprego", from: () => "Entidades de juventude e associações comerciais",
    pitch: () => `"Sem experiência não contratam; sem contrato não tem experiência. Alguém precisa quebrar esse ciclo."` },
  { id: "licenca_paternidade", kind: "PROJETO", offices: FED, theme: "família", segment: "classe_media", impact: 2.5, difficulty: 0.6, polemic: "entidades empresariais falaram em custo para as pequenas empresas",
    title: () => "Licença-paternidade de 30 dias", from: () => "Uma frente de pais e mães de primeira viagem",
    pitch: () => `"Cinco dias e o pai volta pro trabalho com o bebê de uma semana em casa. Isso não é cuidado."` },
  { id: "dados_criancas", kind: "PROJETO", offices: FED, theme: "tecnologia", segment: "classe_media", impact: 2.5, difficulty: 0.5, polemic: "as plataformas digitais fizeram lobby contra",
    title: () => "Proteção de crianças nas redes sociais", from: () => "Pais, escolas e pesquisadores de segurança digital",
    pitch: () => `"Meninas de doze anos recebendo mensagem de adulto. As plataformas sabem e não fazem nada."` },
  { id: "cesta_basica", kind: "PROJETO", offices: FED, theme: "custo de vida", segment: "informais", impact: 3.5, difficulty: 0.65, polemic: "a equipe econômica alertou para a perda de arrecadação",
    title: () => "Imposto zero na cesta básica", from: () => "Sindicatos e associações de donas de casa",
    pitch: () => `"O arroz e o feijão pesam mais no bolso de quem ganha menos. Tirem o imposto da comida."` },
  { id: "emenda_hospital", kind: "INDICACAO", offices: FED, theme: "saúde", segment: "aposentados", impact: 3, difficulty: 0.4,
    title: (h) => `Recursos federais para o hospital filantrópico de ${h}`, from: (h) => `A Santa Casa de ${h}`,
    pitch: (h) => `"Atendemos o SUS de toda a região de ${h} e fechamos o mês no vermelho. Sem ajuda, fechamos a maternidade."` },
  { id: "apostas", kind: "PROJETO", offices: FED, theme: "consumidor", segment: "trabalhadores_formais", impact: 2.5, difficulty: 0.6, polemic: "as casas de aposta e clubes patrocinados reagiram",
    title: () => "Limites à propaganda de apostas esportivas", from: () => "Psicólogos e famílias de endividados com apostas",
    pitch: () => `"Meu marido perdeu o salário inteiro no celular. A propaganda está em todo intervalo de jogo."` },
  { id: "aposentado_remedio", kind: "PROJETO", offices: FED, theme: "saúde", segment: "aposentados", impact: 3, difficulty: 0.55,
    title: () => "Remédios de uso contínuo gratuitos para aposentados", from: () => "Uma federação de aposentados",
    pitch: () => `"Com a aposentadoria mínima, ou compro remédio ou compro comida."` },
  // ------------------------------------------------------------- Prefeitura: obras e programas
  { id: "asfalto_bairro", kind: "OBRA", offices: PREF, theme: "infraestrutura", segment: "trabalhadores_formais", impact: 4, difficulty: 0.45,
    title: (h) => `Asfalto nas ruas de terra do ${h}`, from: (h) => `Moradores do ${h}`,
    pitch: (h) => `"Trinta anos de poeira no verão e lama no inverno. O ${h} também é cidade."` },
  { id: "ubs_nova", kind: "OBRA", offices: PREF, theme: "saúde", segment: "informais", impact: 5, difficulty: 0.55,
    title: (h) => `Nova unidade de saúde no ${h}`, from: (h) => `O conselho local de saúde do ${h}`,
    pitch: (h) => `"O posto mais perto do ${h} atende quatro bairros. A fila começa às quatro da manhã."` },
  { id: "creche", kind: "OBRA", offices: PREF, theme: "educação", segment: "trabalhadores_formais", impact: 5, difficulty: 0.55,
    title: (h) => `Creche em tempo integral no ${h}`, from: (h) => `Mães do ${h}`,
    pitch: () => `"Sem creche, a mãe não trabalha. Tem 300 crianças na fila de espera."` },
  { id: "onibus_noturno", kind: "OBRA", offices: PREF, theme: "transporte", segment: "jovens_urbanos", impact: 3, difficulty: 0.4,
    title: () => "Linha de ônibus noturna ligando os bairros ao centro", from: () => "Trabalhadores do turno da noite",
    pitch: () => `"Quem sai à meia-noite do serviço paga aplicativo com metade do salário do dia."` },
  { id: "centro_revitalizado", kind: "OBRA", offices: PREF, theme: "economia local", segment: "classe_media", impact: 3.5, difficulty: 0.55,
    title: () => "Revitalização do centro (calçadas, iluminação e praça)", from: () => "A associação comercial e a CDL",
    pitch: () => `"O centro morreu depois das seis. Com calçada e luz, o movimento volta e o comércio respira."` },
  { id: "drenagem", kind: "OBRA", offices: PREF, theme: "infraestrutura", segment: "informais", impact: 4.5, difficulty: 0.6,
    title: (h) => `Drenagem contra enchentes no ${h}`, from: (h) => `Famílias que perderam tudo na última cheia do ${h}`,
    pitch: () => `"Toda chuva forte a água entra em casa. Já perdemos geladeira, sofá e documentos."` },
  // ------------------------------------------------------------- Governo do estado
  { id: "duplicacao", kind: "OBRA", offices: GOV, theme: "infraestrutura", segment: "agro", impact: 4, difficulty: 0.6,
    title: (h) => `Duplicação da rodovia estadual até ${h}`, from: (h) => `Prefeitos e empresários da região de ${h}`,
    pitch: () => `"É a estrada que mais mata no estado. E é por onde passa toda a safra."` },
  { id: "policia_concurso", kind: "OBRA", offices: GOV, theme: "segurança", segment: "classe_media", impact: 4, difficulty: 0.5,
    title: () => "Concurso para mil novos policiais e viaturas", from: () => "Associações de policiais e de comerciantes",
    pitch: () => `"Tem cidade com uma viatura para trinta mil habitantes. À noite, não tem ninguém."` },
  { id: "escola_integral", kind: "OBRA", offices: GOV, theme: "educação", segment: "trabalhadores_formais", impact: 4.5, difficulty: 0.6,
    title: () => "Escolas estaduais em tempo integral", from: () => "Educadores e conselhos escolares",
    pitch: () => `"Meio período não dá conta. Onde há tempo integral, a evasão caiu pela metade."` },
  { id: "hospital_estadual", kind: "OBRA", offices: GOV, theme: "saúde", segment: "aposentados", impact: 5, difficulty: 0.65,
    title: (h) => `Hospital estadual em ${h}`, from: (h) => `Lideranças da região de ${h}`,
    pitch: () => `"Para uma cirurgia, a fila é de dois anos. E a viagem até a capital, de seis horas."` },
  // ------------------------------------------------------------- Presidência
  { id: "habitacao", kind: "OBRA", offices: PRES, theme: "moradia", segment: "informais", impact: 4, difficulty: 0.6,
    title: () => "Programa nacional de moradia popular", from: () => "Movimentos de moradia e a indústria da construção",
    pitch: () => `"O déficit é de seis milhões de casas. Cada obra gera emprego na hora."` },
  { id: "ferrovia", kind: "OBRA", offices: PRES, theme: "infraestrutura", segment: "agro", impact: 3.5, difficulty: 0.7,
    title: () => "Ferrovia para escoar a safra até os portos", from: () => "O setor do agronegócio e governadores",
    pitch: () => `"Metade do preço do grão é frete de caminhão. Com trilho, o Brasil fica competitivo."` },
  { id: "creche_nacional", kind: "OBRA", offices: PRES, theme: "educação", segment: "trabalhadores_formais", impact: 4, difficulty: 0.55,
    title: () => "Mil creches novas em todo o país", from: () => "Prefeitos e movimentos de mães",
    pitch: () => `"A mulher que tem com quem deixar o filho volta ao mercado de trabalho."` },
];

export const PROPOSAL_BY_ID: Record<string, ProposalTemplate> = Object.fromEntries(PROPOSAL_TEMPLATES.map((t) => [t.id, t]));

export function scopeOf(office: OfficeCode): Scope {
  if (office === "VEREADOR" || office === "PREFEITO") return "MUNICIPAL";
  if (office === "DEP_ESTADUAL" || office === "GOVERNADOR") return "ESTADUAL";
  return "FEDERAL";
}

/** Lugar do pedido: um bairro real da cidade, uma cidade do estado ou do país. */
export function placeFor(ctx: Ctx, p: PersonRow, rng: Rng, office: OfficeCode): string {
  const scope = scopeOf(office);
  if (scope === "MUNICIPAL") {
    const ch = cityHousing(ctx.s, homeCityOf(p));
    return rng.weighted(ch.bairros, (b) => Math.sqrt(b.pop) + 1).name;
  }
  const cities = [...(ctx.s.cities?.values() ?? [])].filter((c) => (scope === "ESTADUAL" || office === "SENADOR" || office === "DEP_FEDERAL" ? c.uf === p.uf : true) && !c.capital);
  if (cities.length) return rng.weighted(cities, (c) => Math.sqrt(c.electorate)).name;
  return UF_BY_CODE[p.uf]?.name ?? p.uf;
}

export function activeProposals(st: PersonStateRow): Proposal[] {
  return (st.story?.proposals ?? []).filter((x) => x.stage !== "FIM");
}

export function proposalById(st: PersonStateRow, id: string | number | undefined): Proposal | undefined {
  return (st.story?.proposals ?? []).find((x) => x.id === String(id));
}

/** Modelos que cabem no cargo e que não chegaram nos últimos dois anos. */
export function templatesFor(st: PersonStateRow, office: OfficeCode, date: ISODate): ProposalTemplate[] {
  const s = st.story;
  const recent = (id: string) => {
    const last = s?.flags[`gab:${id}`];
    return typeof last === "string" && last > addDays(date, -730);
  };
  const active = new Set(activeProposals(st).map((x) => x.tpl));
  return PROPOSAL_TEMPLATES.filter((t) => t.offices.includes(office) && !active.has(t.id) && !recent(t.id));
}

export function newProposal(ctx: Ctx, p: PersonRow, st: PersonStateRow, t: { tpl: string; title: string; kind: ProposalKind; from: string; from_id?: string | null; place?: string | null; segment: string; impact: number; difficulty: number }, stage: ProposalStage, nextIn: number): Proposal {
  const s = storyOf(st, p, ctx.date);
  const prop: Proposal = {
    id: ctx.id("prop", p.id, t.tpl),
    tpl: t.tpl,
    title: t.title,
    kind: t.kind,
    from: t.from,
    from_id: t.from_id ?? null,
    bairro: t.place ?? null,
    segment: t.segment,
    stage,
    support: Math.max(0.1, Math.min(0.9, 0.62 - t.difficulty * 0.45 + p.reputation / 400)),
    impact: t.impact,
    on: ctx.date,
    next: addDays(ctx.date, nextIn),
    done: null,
    result: null,
    log: [{ on: ctx.date, text: stage === "ENVIADA" ? "Indicação enviada ao Executivo." : stage === "ESTUDO" ? "Projeto técnico encomendado." : "Protocolado." }],
  };
  s.flags[`gab:${t.tpl}`] = ctx.date;
  s.proposals = [prop, ...(s.proposals ?? [])];
  trimProposals(s.proposals);
  return prop;
}

function trimProposals(list: Proposal[]): void {
  const done = list.filter((x) => x.stage === "FIM");
  if (done.length > 14) {
    const keep = new Set(done.slice(0, 14).map((x) => x.id));
    for (let i = list.length - 1; i >= 0; i--) if (list[i].stage === "FIM" && !keep.has(list[i].id)) list.splice(i, 1);
  }
}

export function advanceProposal(prop: Proposal, date: ISODate, stage: ProposalStage, nextIn: number | null, text: string): void {
  prop.stage = stage;
  prop.next = nextIn == null ? null : addDays(date, nextIn);
  prop.log = [{ on: date, text }, ...prop.log].slice(0, 10);
}

export function finishProposal(prop: Proposal, date: ISODate, result: ProposalResult, text: string): void {
  prop.stage = "FIM";
  prop.result = result;
  prop.done = date;
  prop.next = null;
  prop.log = [{ on: date, text }, ...prop.log].slice(0, 10);
}

/** Fim do mandato: o que estava andando é arquivado. */
export function archiveProposals(st: PersonStateRow, date: ISODate): void {
  for (const prop of activeProposals(st)) finishProposal(prop, date, "ARQUIVADA", "Arquivada com o fim do mandato.");
}

export const PROPOSAL_STAGE_LABEL: Record<ProposalStage, string> = {
  ENVIADA: "aguardando resposta do Executivo",
  PROTOCOLADA: "protocolada",
  COMISSAO: "na comissão",
  PLENARIO: "pronta para o plenário",
  SANCAO: "aguardando sanção",
  ESTUDO: "em projeto técnico",
  LICITACAO: "em licitação",
  OBRA: "em obras",
  FIM: "concluída",
};

export const PROPOSAL_RESULT_LABEL: Record<ProposalResult, string> = {
  ATENDIDA: "atendida",
  NEGADA: "negada",
  LEI: "virou lei",
  REJEITADA: "rejeitada",
  VETADA: "vetada",
  ARQUIVADA: "arquivada",
  INAUGURADA: "inaugurada",
  CANCELADA: "cancelada",
};

/** Ordem das etapas, para a barra de progresso. */
export function stageProgress(prop: Proposal): number {
  const flow: Record<ProposalKind, ProposalStage[]> = {
    INDICACAO: ["ENVIADA", "FIM"],
    PROJETO: ["PROTOCOLADA", "COMISSAO", "PLENARIO", "SANCAO", "FIM"],
    OBRA: ["ESTUDO", "LICITACAO", "OBRA", "FIM"],
  };
  const steps = flow[prop.kind];
  const i = Math.max(0, steps.indexOf(prop.stage));
  return prop.stage === "FIM" ? 1 : (i + 0.5) / steps.length;
}
