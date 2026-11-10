import type { ActionDef, ActionResult } from "./actions";
import { relKey } from "./affiliation";
import { addDays, formatDatePt } from "./calendar";
import { subsidyFor, worldPriceLevel } from "./finance";
import {
  buyCar,
  buyHome,
  CARS,
  cityHousing,
  ensureHousing,
  findBairro,
  homeCityOf,
  HOME_TIERS,
  moveToFamily,
  moveToStreet,
  payOffLoan,
  rentHome,
  sellCar,
  sellHomeAndMove,
  type AfterSale,
} from "./housing";
import { activeMembership, isPresident, partyMembersInScope, partyOfficersInScope, partyPostOf } from "./partypost";
import type { Rng } from "./rng";
import type { Ctx } from "./state";
import { liveCandidacy } from "./story/context";
import { scheduleStory, storyOf } from "./story/state";
import type { CarModel } from "./story/types";
import { partyLeader } from "./story/world";
import type { PersonRow, PersonStateRow } from "./types";
import { isReal } from "./news/policy";
import { injure, INJURIES } from "./wellbeing";
import { bondAll, FAMILY_ACTIONS, familyOf } from "./family";

/**
 * Ações de vida (descanso, esporte, família), de bens (casa e carro) e de comando
 * do partido (para quem tem cargo na direção).
 */

const fmt = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const price = (ctx: Ctx, base: number) => (base ? Math.max(10, Math.round((base * worldPriceLevel(ctx.world)) / 10) * 10) : 0);

function spendMoney(ctx: Ctx, p: PersonRow, st: PersonStateRow, amount: number, kind: "LAZER" | "SAUDE" | "DESPESA", description: string): void {
  if (!amount) return;
  st.money -= amount;
  ctx.insert("finance_transactions", { id: ctx.id("fin", p.id, kind.toLowerCase()), world_id: ctx.world.id, person_id: p.id, candidacy_id: null, kind, amount: -amount, declared: true, game_date: ctx.date, description });
}

// ---------------------------------------------------------------------------
// Descanso e lazer
// ---------------------------------------------------------------------------

interface RestSpec {
  id: string;
  label: string;
  description: string;
  energy: number;
  /** custo (R$ de 2026) */
  cost?: number;
  fatigue: number;
  health: number;
  injury?: { chance: number; kinds: Array<[keyof typeof INJURIES, number]> };
  kind?: "LAZER" | "SAUDE";
  available?: (ctx: Ctx, p: PersonRow, st: PersonStateRow) => string | null;
  extra?: (ctx: Ctx, p: PersonRow, st: PersonStateRow, f: number, rng: Rng) => string | null;
}

function rest(o: RestSpec): ActionDef {
  return {
    id: o.id,
    label: o.label,
    description: o.description,
    category: "VIDA",
    energy: o.energy,
    costFn: (ctx) => price(ctx, o.cost ?? 0),
    available: (ctx, p, st) => {
      const c = price(ctx, o.cost ?? 0);
      if (c && st.money < c) return `Custa ${fmt(c)}.`;
      return o.available?.(ctx, p, st) ?? null;
    },
    run: ({ ctx, p, st, rng, dr }): ActionResult => {
      const s = storyOf(st, p, ctx.date);
      const f = dr(o.id);
      spendMoney(ctx, p, st, price(ctx, o.cost ?? 0), o.kind ?? "LAZER", o.label);
      const before = s.fatigue ?? 25;
      s.fatigue = r1(clamp(before - o.fatigue * f));
      s.health = r1(clamp(s.health + o.health * f));
      const parts = [`Cansaço ${before.toFixed(0)} → ${s.fatigue.toFixed(0)}.`];
      const extra = o.extra?.(ctx, p, st, f, rng);
      if (extra) parts.unshift(extra);
      if (o.injury && rng.chance(o.injury.chance)) {
        const kind = rng.weighted(o.injury.kinds, ([, w]) => w)[0];
        const inj = injure(st, kind, ctx.date, rng);
        scheduleStory(st, "lesao_cuidado", ctx.date, { kind: inj.kind, from: o.id });
        return { ok: true, message: `Deu ruim: ${inj.label}. Recuperação até ${formatDatePt(inj.until)}; até lá a energia volta mais devagar.` };
      }
      return { ok: true, message: parts.join(" ") };
    },
  };
}

const campaignCrunch = (ctx: Ctx, p: PersonRow): boolean => {
  const c = liveCandidacy(ctx, p.id);
  const e = c ? ctx.t.elections.get(c.election_id) : undefined;
  return !!c && !!e && (c.status === "HOMOLOGADA" || c.status === "SEGUNDO_TURNO") && ctx.date >= addDays(e.first_round, -14) && ctx.date <= (e.runoff ?? e.first_round);
};

const LIFE: ActionDef[] = [
  rest({
    id: "academia",
    label: "Treinar na academia",
    description: "Uma hora de musculação e esteira. Tira a tensão do corpo e melhora a saúde; exagerar dá lesão.",
    energy: 10,
    cost: 45,
    fatigue: 11,
    health: 0.6,
    injury: { chance: 0.012, kinds: [["distensao", 70], ["joelho", 30]] },
  }),
  rest({
    id: "jogar_bola",
    label: "Jogar bola com os amigos",
    description: "A pelada de sempre: suor, resenha e gente do bairro. Descansa a cabeça — mas canela, tornozelo e mão correm risco.",
    energy: 15,
    cost: 25,
    fatigue: 15,
    health: 0.8,
    injury: { chance: 0.05, kinds: [["torcao", 45], ["joelho", 20], ["mao", 15], ["perna", 10], ["braco", 10]] },
    extra: (ctx, p, st, f) => {
      const uf = p.uf;
      st.reach[uf] = Math.min(0.98, (st.reach[uf] ?? 0) + 0.0015 * f);
      return "Depois do jogo, a resenha no bar virou conversa sobre a cidade.";
    },
  }),
  rest({
    id: "caminhada",
    label: "Caminhar no parque",
    description: "Quarenta minutos sem celular. Pouco custo, pouco risco, cabeça mais leve.",
    energy: 5,
    fatigue: 7,
    health: 0.4,
    injury: { chance: 0.006, kinds: [["torcao", 100]] },
  }),
  rest({
    id: "pedalar",
    label: "Pedalar pela cidade",
    description: "Bicicleta pela orla, pela ciclovia ou pelas ruas do bairro. Bom para o corpo; uma queda acontece.",
    energy: 8,
    fatigue: 9,
    health: 0.5,
    injury: { chance: 0.02, kinds: [["braco", 40], ["mao", 35], ["joelho", 25]] },
  }),
  rest({
    id: "dia_familia",
    label: "Passar o dia com a família",
    description: "Almoço demorado, conversa, um passeio. A política espera um dia. Aproxima todo mundo da família.",
    energy: 0,
    cost: 120,
    fatigue: 12,
    health: 0.2,
    extra: (ctx, p, st, f) => (familyOf(ctx, p, st).length ? (bondAll(ctx, p, st, 8 * f), "A família agradeceu a sua presença.") : null),
  }),
  rest({
    id: "viagem_fds",
    label: "Viajar no fim de semana (praia ou serra)",
    description: "Dois dias longe de tudo. Recarrega de verdade, mas custa caro.",
    energy: 0,
    cost: 1600,
    fatigue: 28,
    health: 1,
    available: (ctx, p) => (campaignCrunch(ctx, p) ? "Na reta final da campanha, viajar pega mal e custa votos." : null),
  }),
  rest({
    id: "terapia",
    label: "Sessão de terapia",
    description: "Uma hora para falar do que a política faz com a cabeça. Ajuda o sono e a saúde.",
    energy: 0,
    cost: 250,
    fatigue: 12,
    health: 0.6,
    kind: "SAUDE",
  }),
  rest({
    id: "folga",
    label: "Tirar o dia de folga (celular desligado)",
    description: "Nada de reunião, grupo de WhatsApp ou entrevista. Só descanso.",
    energy: 0,
    fatigue: 8,
    health: 0.1,
  }),
  rest({
    id: "hobby",
    label: "Cuidar de um hobby (cozinhar, tocar, ler)",
    description: "Uma tarde fazendo algo que não tem nada a ver com política.",
    energy: 3,
    fatigue: 6,
    health: 0.1,
  }),
  rest({
    id: "churrasco_vizinhos",
    label: "Churrasco com os vizinhos",
    description: "Carne, conversa e vizinhança. Relaxa e ainda aproxima você de quem mora perto.",
    energy: 8,
    cost: 300,
    fatigue: 10,
    health: 0,
    available: (_ctx, _p, st) => (st.story?.home?.kind === "RUA" ? "Sem casa, não dá para receber os vizinhos." : null),
    extra: (ctx, p, st, f) => {
      st.reach[p.uf] = Math.min(0.98, (st.reach[p.uf] ?? 0) + 0.0025 * f);
      st.activism = clamp(st.activism + 1 * f);
      return `A vizinhança do ${st.story?.home?.bairro ?? "bairro"} saiu falando bem de você.`;
    },
  }),
  rest({
    id: "checkup",
    label: "Fazer check-up médico",
    description: "Exames de rotina no particular. Pega problema cedo e melhora a saúde.",
    energy: 5,
    cost: 650,
    fatigue: 0,
    health: 3,
    kind: "SAUDE",
    extra: (_ctx, _p, st) => ((st.story?.health ?? 80) < 55 ? "O médico pediu calma: pressão alta e sinais de estresse." : "Exames em ordem."),
  }),
];

// ---------------------------------------------------------------------------
// Bens: casa e carro
// ---------------------------------------------------------------------------

const subsidyOf = (ctx: Ctx, p: PersonRow) => (p.office_code ? subsidyFor(ctx, p.office_code, p.office_geo) : 0);
const homeOf = (ctx: Ctx, p: PersonRow, st: PersonStateRow) => ensureHousing(ctx.s, p, st, ctx.date).home!;

const BENS: ActionDef[] = [
  {
    id: "alugar_imovel",
    label: "Alugar um lugar para morar",
    description: "Escolha o bairro e o padrão. Paga-se a caução, o primeiro aluguel e a mudança.",
    category: "BENS",
    energy: 20,
    params: [
      { name: "bairro", label: "Bairro", type: "bairro" },
      { name: "padrao", label: "Padrão do imóvel", type: "home_tier" },
    ],
    available: (ctx, p, st) => (homeOf(ctx, p, st).kind === "PROPRIA" ? "Você mora em casa própria: venda antes de alugar." : null),
    run: ({ ctx, p, st, params }) => rentHome(ctx, p, st, params.bairro, Number(params.padrao)),
  },
  {
    id: "comprar_imovel",
    label: "Comprar casa ou apartamento",
    description: "À vista ou financiado (entrada de 20%, até 30 anos, prestação de no máximo 35% da renda). Mais ITBI, cartório e mudança.",
    category: "BENS",
    energy: 15,
    params: [
      { name: "bairro", label: "Bairro", type: "bairro" },
      { name: "padrao", label: "Padrão do imóvel", type: "home_tier" },
      { name: "pagamento", label: "Pagamento", type: "pay" },
    ],
    available: (ctx, p, st) => (homeOf(ctx, p, st).kind === "PROPRIA" ? "Você já tem casa própria." : null),
    run: ({ ctx, p, st, params }) => buyHome(ctx, p, st, subsidyOf(ctx, p), params.bairro, Number(params.padrao), params.pagamento === "FINANCIADO"),
  },
  {
    id: "vender_imovel",
    label: "Vender a casa própria",
    description: "Corretagem de 6%; se houver financiamento, o saldo é quitado com o dinheiro da venda. Escolha para onde vai depois.",
    category: "BENS",
    energy: 10,
    confirm: "Você vai vender o imóvel em que mora. A mudança acontece hoje.",
    params: [{ name: "depois", label: "Depois da venda", type: "after_sale" }],
    available: (ctx, p, st) => (homeOf(ctx, p, st).kind !== "PROPRIA" ? "Você não tem imóvel próprio." : null),
    run: ({ ctx, p, st, params }) => sellHomeAndMove(ctx, p, st, (params.depois as AfterSale) || "ALUGAR"),
  },
  {
    id: "morar_familia",
    label: "Voltar a morar com a família",
    description: "Sem aluguel; você ajuda nas contas da casa. Mais apertado, mais barato.",
    category: "BENS",
    energy: 10,
    available: (ctx, p, st) => {
      const k = homeOf(ctx, p, st).kind;
      return k === "FAMILIA" ? "Você já mora com a família." : k === "PROPRIA" ? "Você tem casa própria." : null;
    },
    run: ({ ctx, p, st }) => moveToFamily(ctx, p, st),
  },
  {
    id: "sair_de_casa",
    label: "Entregar a casa e ficar sem teto",
    description: "Sem aluguel e sem endereço. A saúde despenca, o cansaço não passa e as pessoas olham diferente.",
    category: "BENS",
    energy: 0,
    confirm: "Você vai ficar sem casa. A saúde, a energia e a imagem vão sofrer enquanto durar.",
    available: (ctx, p, st) => {
      const k = homeOf(ctx, p, st).kind;
      return k === "RUA" ? "Você já está sem casa." : k === "PROPRIA" ? "Você tem casa própria: venda antes." : null;
    },
    run: ({ ctx, p, st }) => moveToStreet(ctx, p, st),
  },
  {
    id: "comprar_carro",
    label: "Comprar carro ou moto",
    description: "À vista ou financiado em 48 vezes (entrada de 20%). O carro atual entra na troca.",
    category: "BENS",
    energy: 5,
    params: [
      { name: "modelo", label: "Modelo", type: "car_model" },
      { name: "pagamento", label: "Pagamento", type: "pay" },
    ],
    available: () => null,
    run: ({ ctx, p, st, params }) => buyCar(ctx, p, st, subsidyOf(ctx, p), params.modelo as CarModel, params.pagamento === "FINANCIADO"),
  },
  {
    id: "vender_carro",
    label: "Vender o carro",
    description: "Pelo preço de mercado (com desconto de revenda). Sem carro, o deslocamento cansa mais.",
    category: "BENS",
    energy: 5,
    available: (ctx, p, st) => (ensureHousing(ctx.s, p, st, ctx.date).car ? null : "Você não tem carro."),
    run: ({ ctx, p, st }) => sellCar(ctx, p, st),
  },
  {
    id: "quitar_financiamento",
    label: "Quitar um financiamento",
    description: "Pagar de uma vez o saldo devedor da casa ou do carro.",
    category: "BENS",
    energy: 0,
    params: [{ name: "qual", label: "Financiamento", type: "loan" }],
    available: (ctx, p, st) => {
      const s = ensureHousing(ctx.s, p, st, ctx.date);
      return s.home?.loan || s.car?.loan ? null : "Você não tem financiamento.";
    },
    run: ({ ctx, p, st, params }) => payOffLoan(ctx, p, st, params.qual === "carro" ? "carro" : "casa"),
  },
];

/** Opções de bairro com preços (para a tela). */
export function bairroOptions(ctx: Ctx, p: PersonRow): Array<{ value: string; label: string }> {
  const ch = cityHousing(ctx.s, homeCityOf(p));
  return [...ch.bairros].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((b) => ({ value: b.name, label: b.name }));
}

export const HOME_TIER_OPTIONS = HOME_TIERS.map((t) => ({ value: String(t.tier), label: `${t.label.charAt(0).toUpperCase()}${t.label.slice(1)} (${t.size} m²)` }));
export const CAR_OPTIONS = (Object.keys(CARS) as CarModel[]).map((m) => ({ value: m, label: CARS[m].label.charAt(0).toUpperCase() + CARS[m].label.slice(1) }));

// ---------------------------------------------------------------------------
// Comando do partido
// ---------------------------------------------------------------------------

function bumpRel(ctx: Ctx, a: string, b: string, delta: number): void {
  const id = relKey(a, b);
  const rel = ctx.t.relationships.get(id) ?? { id, world_id: ctx.world.id, a_id: a, b_id: b, score: 0, interactions: 0, last_on: ctx.date };
  rel.score = clamp(rel.score + delta, -100, 100);
  rel.interactions += 1;
  rel.last_on = ctx.date;
  ctx.save("relationships", rel);
}

const REAL_GUARD = "Pessoas reais não entram nas disputas internas do jogo: só personagens fictícios e outros jogadores.";

const needPost = (ctx: Ctx, p: PersonRow, st: PersonStateRow) => (partyPostOf(ctx.s, p, st) ? null : "Só para quem tem cargo na direção do partido.");
const needPresident = (ctx: Ctx, p: PersonRow, st: PersonStateRow) => {
  const post = partyPostOf(ctx.s, p, st);
  return isPresident(post?.level) ? null : "Só para quem preside um diretório do partido.";
};

const COMANDO: ActionDef[] = [
  {
    id: "reuniao_executiva",
    label: "Reunir a executiva do partido",
    description: "Pauta, cobrança de tarefas e um café. Mantém a máquina andando e a direção unida.",
    category: "COMANDO",
    energy: 10,
    available: needPost,
    run: ({ ctx, p, st, dr, rng }) => {
      const f = dr("reuniao_executiva");
      const party = ctx.t.parties.get(p.party_id!)!;
      st.party_standing = clamp(st.party_standing + 2 * f);
      st.political_capital = clamp(st.political_capital + 1 * f);
      party.discipline = Math.min(0.98, Math.round((party.discipline + 0.003 * f) * 1000) / 1000);
      ctx.save("parties", party);
      const post = partyPostOf(ctx.s, p, st)!;
      const officers = partyOfficersInScope(ctx.s, p, post.level === "SECRETARIO" ? "PRES_MUNICIPAL" : post.level).slice(0, 6);
      for (const o of rng.shuffle([...officers]).slice(0, 2)) bumpRel(ctx, p.id, o.id, 3);
      return { ok: true, message: "Reunião produtiva: tarefas distribuídas, atas assinadas, ninguém saiu brigado." };
    },
  },
  {
    id: "campanha_filiacao",
    label: "Fazer campanha de filiação",
    description: "Banca na praça, visita a associações, fichas na mão. Mais filiados, mais força na região.",
    category: "COMANDO",
    energy: 15,
    costFn: (ctx) => price(ctx, 500),
    available: (ctx, p, st) => needPost(ctx, p, st) ?? (st.money < price(ctx, 500) ? `Custa ${fmt(price(ctx, 500))}.` : null),
    run: ({ ctx, p, st, dr, rng }) => {
      const f = dr("campanha_filiacao");
      spendMoney(ctx, p, st, price(ctx, 500), "DESPESA", "Campanha de filiação");
      const party = ctx.t.parties.get(p.party_id!)!;
      const n = Math.round(rng.int(30, 120) * f);
      party.members += n;
      party.territory[p.uf] = Math.min(1, Math.round(((party.territory[p.uf] ?? 0) + 0.0015 * f) * 10_000) / 10_000);
      ctx.save("parties", party);
      st.activism = clamp(st.activism + 2 * f);
      st.party_standing = clamp(st.party_standing + 1 * f);
      return { ok: true, message: `${n} fichas de filiação preenchidas. O ${party.acronym} ficou maior na região.` };
    },
  },
  {
    id: "formacao_militancia",
    label: "Organizar curso de formação para a militância",
    description: "Oratória, legislação eleitoral e o programa do partido. Militância preparada erra menos.",
    category: "COMANDO",
    energy: 15,
    costFn: (ctx) => price(ctx, 300),
    available: (ctx, p, st) => needPost(ctx, p, st) ?? (st.money < price(ctx, 300) ? `Custa ${fmt(price(ctx, 300))}.` : null),
    run: ({ ctx, p, st, dr }) => {
      const f = dr("formacao_militancia");
      spendMoney(ctx, p, st, price(ctx, 300), "DESPESA", "Curso de formação da militância");
      const party = ctx.t.parties.get(p.party_id!)!;
      party.integrity = Math.min(1, Math.round((party.integrity + 0.002 * f) * 1000) / 1000);
      ctx.save("parties", party);
      st.activism = clamp(st.activism + 2 * f);
      st.party_standing = clamp(st.party_standing + 1.5 * f);
      return { ok: true, message: "Sala cheia num sábado de manhã. A militância saiu com apostila e vontade." };
    },
  },
  {
    id: "nomear_dirigente",
    label: "Nomear alguém para a executiva",
    description: "Dê um cargo na direção a um filiado. Quem é nomeado fica do seu lado; quem ficou de fora, nem sempre.",
    category: "COMANDO",
    energy: 10,
    params: [{ name: "pessoa", label: "Quem nomear", type: "party_plain" }],
    available: needPresident,
    run: ({ ctx, p, st, params, rng }) => {
      const who = ctx.person(params.pessoa);
      const post = partyPostOf(ctx.s, p, st);
      if (!who || !post || who.party_id !== p.party_id) return { ok: false, message: "Essa pessoa não é do partido." };
      if (isReal(who.kind)) return { ok: false, message: REAL_GUARD };
      const m = activeMembership(ctx.s, who.id);
      if (!m) return { ok: false, message: "Filiação não encontrada." };
      if (m.role !== "MEMBRO") return { ok: false, message: `${who.name} já faz parte da direção.` };
      m.role = "DIRIGENTE";
      ctx.save("memberships", m);
      bumpRel(ctx, p.id, who.id, 15);
      st.party_standing = clamp(st.party_standing + 1);
      if (rng.chance(0.3)) scheduleStory(st, "ciumes_nomeacao", addDays(ctx.date, rng.int(5, 15)), { who: who.id });
      return { ok: true, message: `${who.name} agora é da executiva. Ligou para agradecer e prometer lealdade.` };
    },
  },
  {
    id: "afastar_dirigente",
    label: "Afastar alguém da executiva",
    description: "Tirar o cargo de quem não trabalha ou conspira. Disciplina sobe; a pessoa vira adversária.",
    category: "COMANDO",
    energy: 10,
    confirm: "A pessoa perde o cargo na direção e vai lembrar disso.",
    params: [{ name: "pessoa", label: "Quem afastar", type: "party_officer" }],
    available: needPresident,
    run: ({ ctx, p, st, params, rng }) => {
      const who = ctx.person(params.pessoa);
      if (!who || who.party_id !== p.party_id) return { ok: false, message: "Essa pessoa não é do partido." };
      if (isReal(who.kind)) return { ok: false, message: REAL_GUARD };
      const m = activeMembership(ctx.s, who.id);
      if (!m || m.role === "MEMBRO") return { ok: false, message: `${who.name} não tem cargo na direção.` };
      m.role = "MEMBRO";
      ctx.save("memberships", m);
      bumpRel(ctx, p.id, who.id, -25);
      const party = ctx.t.parties.get(p.party_id!)!;
      party.discipline = Math.min(0.98, Math.round((party.discipline + 0.005) * 1000) / 1000);
      ctx.save("parties", party);
      scheduleStory(st, "afastado_reage", addDays(ctx.date, rng.int(4, 12)), { who: who.id });
      return { ok: true, message: `${who.name} está fora da executiva. A notícia correu rápido pelos grupos do partido.` };
    },
  },
  {
    id: "processo_expulsao",
    label: "Abrir processo de expulsão",
    description: "Leva um filiado ao conselho de ética. Com provas, limpa o partido; sem provas, vira perseguição.",
    category: "COMANDO",
    energy: 15,
    confirm: "O processo vai ao conselho de ética e vira notícia. Sem provas, quem sai chamuscado é você.",
    params: [{ name: "pessoa", label: "Contra quem", type: "party_member" }],
    available: needPresident,
    run: ({ ctx, p, st, params, rng }) => {
      const who = ctx.person(params.pessoa);
      if (!who || who.party_id !== p.party_id) return { ok: false, message: "Essa pessoa não é do partido." };
      if (isReal(who.kind)) return { ok: false, message: REAL_GUARD };
      const s = storyOf(st, p, ctx.date);
      if (s.flags[`expulsao:${who.id}`]) return { ok: false, message: "Já há um processo aberto contra essa pessoa." };
      s.flags[`expulsao:${who.id}`] = ctx.date;
      scheduleStory(st, "conselho_etica", addDays(ctx.date, rng.int(15, 30)), { who: who.id });
      bumpRel(ctx, p.id, who.id, -30);
      return { ok: true, message: `Processo aberto contra ${who.name}. O conselho de ética tem algumas semanas para decidir.` };
    },
  },
  {
    id: "orientar_bancada",
    label: "Orientar a bancada numa votação",
    description: "Define como os deputados do partido devem votar um projeto na Câmara. Bancada disciplinada segue.",
    category: "COMANDO",
    energy: 10,
    params: [
      { name: "bill", label: "Projeto", type: "bill" },
      { name: "vote", label: "Orientação", type: "choice", options: [{ value: "SIM", label: "Votar sim" }, { value: "NAO", label: "Votar não" }, { value: "LIBERADA", label: "Liberar a bancada" }] },
    ],
    available: (ctx, p, st) => {
      const post = partyPostOf(ctx.s, p, st);
      if (post?.level !== "PRES_NACIONAL") return "Só a presidência nacional orienta a bancada federal.";
      if (!(ctx.t.parties.get(p.party_id!)?.seats.camara ?? 0)) return "O partido não tem deputados federais.";
      return null;
    },
    run: ({ ctx, p, st, params }) => {
      const bill = ctx.t.bills.get(params.bill);
      if (!bill || bill.status !== "TRAMITANDO") return { ok: false, message: "Projeto fora de pauta." };
      storyOf(st, p, ctx.date).flags[`orientacao:${bill.id}`] = params.vote;
      st.party_standing = clamp(st.party_standing + 1);
      return { ok: true, message: params.vote === "LIBERADA" ? "Bancada liberada nessa votação." : `Orientação dada: a bancada vota ${params.vote === "SIM" ? "sim" : "não"} em ${formatDatePt(bill.vote_on)}.` };
    },
  },
  {
    id: "indicar_nome_partido",
    label: "Indicar o nome do partido para a próxima eleição",
    description: "Quem preside o diretório pesa na convenção: o nome indicado (você ou um filiado) larga na frente.",
    category: "COMANDO",
    energy: 10,
    params: [{ name: "pessoa", label: "Quem o partido vai lançar", type: "party_member_or_me" }],
    available: needPresident,
    run: ({ ctx, p, st, params }) => {
      const post = partyPostOf(ctx.s, p, st)!;
      const who = params.pessoa === p.id ? p : ctx.person(params.pessoa);
      if (!who || who.party_id !== p.party_id) return { ok: false, message: "Essa pessoa não é do partido." };
      if (isReal(who.kind)) return { ok: false, message: REAL_GUARD };
      const geo = post.level === "PRES_NACIONAL" ? "BR" : post.level === "PRES_ESTADUAL" ? p.uf : homeCityOf(p);
      storyOf(st, p, ctx.date).flags[`indicacao:${geo}`] = who.id;
      if (who.id !== p.id) bumpRel(ctx, p.id, who.id, 12);
      const scope = post.level === "PRES_NACIONAL" ? "para a Presidência" : post.level === "PRES_ESTADUAL" ? "para o governo do estado" : "para a prefeitura";
      return { ok: true, message: who.id === p.id ? `Você será o nome do partido ${scope}: registre a pré-candidatura quando a pré-campanha abrir.` : `${who.name} é o nome do partido ${scope}. A convenção vai seguir a indicação.` };
    },
  },
  {
    id: "negociar_alianca",
    label: "Negociar aliança com outro partido",
    description: "Conversa com a direção de outra legenda: tempo de TV, palanque e apoio mútuo.",
    category: "COMANDO",
    energy: 15,
    params: [{ name: "party", label: "Com qual partido", type: "party" }],
    available: needPresident,
    run: ({ ctx, p, st, params }) => {
      const other = ctx.t.parties.get(params.party);
      if (!other || other.id === p.party_id || other.status !== "ATIVO") return { ok: false, message: "Escolha outro partido." };
      const s = storyOf(st, p, ctx.date);
      s.flags[`alianca:${other.id}`] = ctx.date;
      const leader = partyLeader(ctx, p, other);
      if (leader) bumpRel(ctx, p.id, leader.id, 10);
      const cand = liveCandidacy(ctx, p.id);
      if (cand) {
        cand.campaign.momentum = Math.max(-1, Math.min(1, cand.campaign.momentum + 0.05));
        const seg = (cand.campaign.seg ??= {});
        for (const k of Object.keys(seg).length ? Object.keys(seg) : ["classe_media", "trabalhadores_formais", "informais"]) seg[k] = Math.max(-1, Math.min(1, (seg[k] ?? 0) + 0.02));
        ctx.save("candidacies", cand);
        return { ok: true, message: `Aliança fechada com o ${other.acronym}: mais tempo de TV e militância na rua para a sua campanha.` };
      }
      st.party_standing = clamp(st.party_standing + 2);
      return { ok: true, message: `Aliança costurada com o ${other.acronym} para a próxima eleição. A direção nacional elogiou a articulação.` };
    },
  },
];

export const LIFE_ACTIONS: ActionDef[] = [...LIFE, ...FAMILY_ACTIONS, ...BENS, ...COMANDO];

/** Opções para os parâmetros novos (bairro, padrão, carro, pagamento, filiados). */
export function lifeParamOptions(ctx: Ctx, p: PersonRow, st: PersonStateRow, type: string): Array<{ value: string; label: string }> | undefined {
  switch (type) {
    case "bairro":
      return bairroOptions(ctx, p);
    case "home_tier":
      return HOME_TIER_OPTIONS;
    case "car_model":
      return CAR_OPTIONS;
    case "pay":
      return [
        { value: "VISTA", label: "À vista" },
        { value: "FINANCIADO", label: "Financiado (entrada de 20%)" },
      ];
    case "after_sale":
      return [
        { value: "ALUGAR", label: "Alugar no mesmo bairro" },
        { value: "FAMILIA", label: "Voltar para a casa da família" },
        { value: "RUA", label: "Ficar sem casa" },
      ];
    case "loan": {
      const s = st.story;
      return [
        ...(s?.home?.loan ? [{ value: "casa", label: `Casa: saldo de ${fmt(s.home.loan.balance)}` }] : []),
        ...(s?.car?.loan ? [{ value: "carro", label: `Carro: saldo de ${fmt(s.car.loan.balance)}` }] : []),
      ];
    }
    case "party_member":
    case "party_member_or_me":
    case "party_plain":
    case "party_officer": {
      const post = partyPostOf(ctx.s, p, st);
      if (!post) return [];
      const level = post.level === "SECRETARIO" ? "PRES_MUNICIPAL" : post.level;
      const officers = new Set(partyOfficersInScope(ctx.s, p, level).map((x) => x.id));
      const list = type === "party_officer" ? partyOfficersInScope(ctx.s, p, level) : partyMembersInScope(ctx.s, p, level).filter((x) => type !== "party_plain" || !officers.has(x.id));
      const opts = list.slice(0, 200).map((x) => ({ value: x.id, label: `${x.name} — ${x.role_label ?? (x.office_code ? "com mandato" : "filiado(a)")} · ${x.uf}` }));
      return type === "party_member_or_me" ? [{ value: p.id, label: `Você (${p.name})` }, ...opts] : opts;
    }
    default:
      return undefined;
  }
}

export { findBairro };
