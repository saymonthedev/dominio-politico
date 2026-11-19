import type { ActionDef, ActionResult } from "./actions";
import { bumpApproval } from "./approval";
import type { ISODate } from "./calendar";
import { geoName } from "./elections";
import { genderOf, officeTitle } from "./gender";
import { ideologyAffinity } from "./ideology";
import { freshName } from "./names";
import { namesInUse } from "./npc";
import { executiveMandate } from "./plenario";
import type { OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import { storyOf } from "./story/state";
import type { MandateRow, PartyRow, PersonRow, PersonStateRow } from "./types";

/**
 * Secretariado e ministérios (sugestão do jogador Gabriel do Valle): o jogador que é prefeito,
 * governador ou presidente escolhe quem comanda cada secretaria (ou ministério) e cria ou extingue
 * pastas. Técnico melhora a gestão; nome do próprio partido agrada a direção; indicação de outro
 * partido traz a bancada dele para perto do governo (votos nas votações e contra um impeachment).
 */

export type CabinetKind = "TECNICO" | "PARTIDO" | "ALIADO";

export interface CabinetPost {
  /** id da pasta no catálogo */
  id: string;
  name: string;
  /** quem comanda (null = vaga) */
  holder: string | null;
  /** partido de quem comanda (técnico: null) */
  party_id: string | null;
  kind: CabinetKind | null;
  since: ISODate | null;
}

export interface Cabinet {
  office: OfficeCode;
  geo: string;
  /** o mandato a que o secretariado pertence: acabou o mandato, acabou o secretariado */
  mandate: string;
  posts: CabinetPost[];
}

type Level = "MUNICIPAL" | "ESTADUAL" | "FEDERAL";

/** Pastas possíveis em cada esfera: id, nome completo e se já existe no começo do mandato. */
const CATALOG: Record<Level, Array<[id: string, name: string, base: boolean]>> = {
  MUNICIPAL: [
    ["saude", "Secretaria Municipal de Saúde", true],
    ["educacao", "Secretaria Municipal de Educação", true],
    ["obras", "Secretaria Municipal de Obras e Infraestrutura", true],
    ["fazenda", "Secretaria Municipal da Fazenda", true],
    ["social", "Secretaria Municipal de Assistência Social", true],
    ["administracao", "Secretaria Municipal de Administração", true],
    ["ambiente", "Secretaria Municipal do Meio Ambiente", false],
    ["mobilidade", "Secretaria Municipal de Mobilidade e Trânsito", false],
    ["cultura", "Secretaria Municipal de Cultura e Turismo", false],
    ["esporte", "Secretaria Municipal de Esporte e Lazer", false],
    ["seguranca", "Secretaria Municipal de Segurança e Defesa Civil", false],
    ["economia", "Secretaria Municipal de Desenvolvimento Econômico", false],
    ["habitacao", "Secretaria Municipal de Habitação", false],
    ["mulher", "Secretaria Municipal de Políticas para as Mulheres", false],
  ],
  ESTADUAL: [
    ["casa_civil", "Casa Civil do Governo do Estado", true],
    ["fazenda", "Secretaria Estadual da Fazenda", true],
    ["saude", "Secretaria Estadual de Saúde", true],
    ["educacao", "Secretaria Estadual de Educação", true],
    ["seguranca", "Secretaria Estadual de Segurança Pública", true],
    ["infraestrutura", "Secretaria Estadual de Infraestrutura", true],
    ["social", "Secretaria Estadual de Desenvolvimento Social", true],
    ["ambiente", "Secretaria Estadual do Meio Ambiente", false],
    ["agricultura", "Secretaria Estadual de Agricultura", false],
    ["cultura", "Secretaria Estadual de Cultura", false],
    ["ciencia", "Secretaria Estadual de Ciência e Tecnologia", false],
    ["turismo", "Secretaria Estadual de Turismo", false],
    ["penitenciaria", "Secretaria Estadual de Administração Penitenciária", false],
    ["habitacao", "Secretaria Estadual de Habitação", false],
    ["mulher", "Secretaria Estadual de Políticas para as Mulheres", false],
  ],
  FEDERAL: [
    ["casa_civil", "Casa Civil da Presidência da República", true],
    ["fazenda", "Ministério da Fazenda", true],
    ["planejamento", "Ministério do Planejamento e Orçamento", true],
    ["saude", "Ministério da Saúde", true],
    ["educacao", "Ministério da Educação", true],
    ["justica", "Ministério da Justiça e Segurança Pública", true],
    ["defesa", "Ministério da Defesa", true],
    ["exteriores", "Ministério das Relações Exteriores", true],
    ["agricultura", "Ministério da Agricultura e Pecuária", true],
    ["social", "Ministério do Desenvolvimento e Assistência Social", true],
    ["trabalho", "Ministério do Trabalho e Emprego", true],
    ["energia", "Ministério de Minas e Energia", true],
    ["transportes", "Ministério dos Transportes", true],
    ["ambiente", "Ministério do Meio Ambiente", true],
    ["cidades", "Ministério das Cidades", false],
    ["cultura", "Ministério da Cultura", false],
    ["ciencia", "Ministério da Ciência, Tecnologia e Inovação", false],
    ["comunicacoes", "Ministério das Comunicações", false],
    ["turismo", "Ministério do Turismo", false],
    ["esporte", "Ministério do Esporte", false],
    ["mulheres", "Ministério das Mulheres", false],
    ["igualdade", "Ministério da Igualdade Racial", false],
    ["indigenas", "Ministério dos Povos Indígenas", false],
    ["previdencia", "Ministério da Previdência Social", false],
    ["regional", "Ministério da Integração e do Desenvolvimento Regional", false],
    ["portos", "Ministério de Portos e Aeroportos", false],
    ["pesca", "Ministério da Pesca e Aquicultura", false],
  ],
};

const LEVEL: Partial<Record<OfficeCode, Level>> = { PREFEITO: "MUNICIPAL", GOVERNADOR: "ESTADUAL", PRESIDENTE: "FEDERAL" };

function catalog(level: Level): Array<{ id: string; name: string; base: boolean }> {
  return CATALOG[level].map(([id, name, base]) => ({ id, name, base }));
}

/** Quantas pastas o mandato tem no começo (acima disso, a máquina incha e a aprovação sente). */
const baseCount = (level: Level) => catalog(level).filter((c) => c.base).length;

const levelOf = (m: Pick<MandateRow, "office_code">): Level | null => LEVEL[m.office_code] ?? null;

/** Nome de quem a pasta recebe: inventado e único no mundo (quem é nomeado não vira personagem do jogo). */
function holderName(ctx: Ctx, key: string): string {
  const names = namesInUse(ctx);
  const name = freshName(ctx.rng("secretario", key), names);
  names.add(name);
  return name;
}

/** O secretariado do mandato em exercício (montado na primeira vez: técnicos e nomes do partido). */
export function cabinetOf(ctx: Ctx, p: PersonRow, st: PersonStateRow, create = false): Cabinet | null {
  const m = executiveMandate(ctx, p.id);
  if (!m) return null;
  const level = levelOf(m)!;
  const had = st.story?.cabinet;
  if (had && had.mandate === m.id) return had;
  if (!create) return null;
  const story = storyOf(st, p, ctx.date);
  const posts: CabinetPost[] = catalog(level)
    .filter((c) => c.base)
    .map((c, i) => {
      const own = !!p.party_id && i % 2 === 1;
      return { id: c.id, name: c.name, holder: holderName(ctx, `${m.id}:${c.id}`), party_id: own ? p.party_id : null, kind: own ? "PARTIDO" : "TECNICO", since: m.start_on };
    });
  story.cabinet = { office: m.office_code, geo: m.geo, mandate: m.id, posts };
  ctx.save("person_states", st);
  return story.cabinet;
}

/** O secretariado para a tela (o de agora, ou o que o mandato terá ao ser montado). */
export function cabinetView(ctx: Ctx, p: PersonRow, st: PersonStateRow): { cabinet: Cabinet; level: Level; base: number; title: string; draft: boolean } | null {
  const m = executiveMandate(ctx, p.id);
  if (!m) return null;
  const level = levelOf(m)!;
  const had = st.story?.cabinet?.mandate === m.id ? st.story.cabinet : null;
  const cabinet: Cabinet = had ?? {
    office: m.office_code,
    geo: m.geo,
    mandate: m.id,
    posts: catalog(level)
      .filter((c) => c.base)
      .map((c) => ({ id: c.id, name: c.name, holder: null, party_id: null, kind: null, since: null })),
  };
  return { cabinet, level, base: baseCount(level), title: level === "FEDERAL" ? "Ministérios" : "Secretariado", draft: !had };
}

/** Partidos que podem indicar nomes: o do jogador e os outros com bancada na Casa que fiscaliza o governo. */
function partnerParties(ctx: Ctx, m: MandateRow): PartyRow[] {
  const key = m.office_code === "PRESIDENTE" ? "camara" : m.office_code === "GOVERNADOR" ? `assembleia_${m.geo}` : null;
  return [...ctx.t.parties.values()]
    .filter((x) => x.status === "ATIVO")
    .sort((a, b) => (key ? (b.seats[key] ?? 0) - (a.seats[key] ?? 0) : 0) || (b.territory[m.geo.slice(0, 2)] ?? 0) - (a.territory[m.geo.slice(0, 2)] ?? 0) || a.acronym.localeCompare(b.acronym))
    .slice(0, 14);
}

/* ---------------- opções para a tela (tipos de parâmetro cabinet_post, cabinet_new e cabinet_party) */

export function cabinetPostOptions(ctx: Ctx, p: PersonRow, st: PersonStateRow, filledOnly = false): Array<{ value: string; label: string }> {
  const v = cabinetView(ctx, p, st);
  if (!v) return [];
  return v.cabinet.posts
    .filter((x) => !filledOnly || x.holder)
    .map((x) => ({ value: x.id, label: `${x.name}: ${x.holder ? `${x.holder}${x.kind === "TECNICO" ? " (técnico)" : x.party_id ? ` (${ctx.t.parties.get(x.party_id)?.acronym ?? "partido"})` : ""}` : "vaga"}` }));
}

export function cabinetNewOptions(ctx: Ctx, p: PersonRow, st: PersonStateRow): Array<{ value: string; label: string }> {
  const v = cabinetView(ctx, p, st);
  if (!v) return [];
  const have = new Set(v.cabinet.posts.map((x) => x.id));
  return catalog(v.level)
    .filter((c) => !have.has(c.id))
    .map((c) => ({ value: c.id, label: c.name }));
}

export function cabinetPartyOptions(ctx: Ctx, p: PersonRow): Array<{ value: string; label: string }> {
  const m = executiveMandate(ctx, p.id);
  if (!m) return [];
  const own = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const out = [{ value: "tecnico", label: "Técnico, sem partido: gestão melhor, nenhum voto a mais" }];
  if (own) out.push({ value: own.id, label: `Alguém do seu partido (${own.acronym}): a direção gosta` });
  for (const x of partnerParties(ctx, m)) {
    if (x.id === own?.id) continue;
    const key = m.office_code === "PRESIDENTE" ? "camara" : m.office_code === "GOVERNADOR" ? `assembleia_${m.geo}` : null;
    const seats = key ? x.seats[key] ?? 0 : 0;
    out.push({ value: x.id, label: `Indicação do ${x.acronym}${seats ? ` (${seats} cadeiras)` : ""}: a bancada vira aliada` });
  }
  return out;
}

/* ---------------- efeitos */

/** Presidente: partidos com ministério entram na base do governo; quem perde o último volta ao alinhamento pela afinidade. */
function syncFederalBase(ctx: Ctx, p: PersonRow, cabinet: Cabinet): void {
  if (cabinet.office !== "PRESIDENTE" || ctx.world.gov.president_id !== p.id) return;
  const presParty = p.party_id ? ctx.t.parties.get(p.party_id) : undefined;
  const withPost = new Set(cabinet.posts.map((x) => x.party_id).filter((x): x is string => !!x));
  for (const party of ctx.t.parties.values()) {
    const aff = presParty ? ideologyAffinity(party.ideology, presParty.ideology) : 0.7;
    const natural = party.id === presParty?.id || aff > 0.82 ? 1 : aff < 0.62 ? -1 : 0;
    const next = withPost.has(party.id) ? 1 : natural;
    if (party.gov_alignment !== next) {
      party.gov_alignment = next;
      ctx.save("parties", party);
    }
  }
  ctx.world.gov.base_party_ids = [...ctx.t.parties.values()].filter((x) => x.gov_alignment === 1).map((x) => x.id);
  ctx.saveWorld();
}

/** Mensal: técnicos melhoram a gestão; pasta vaga e máquina inchada pesam na aprovação. */
export function monthlyCabinets(ctx: Ctx): void {
  for (const p of ctx.t.persons.values()) {
    if (p.kind !== "PLAYER" || p.status !== "ACTIVE") continue;
    const st = ctx.pstate(p.id);
    if (!st) continue;
    const m = executiveMandate(ctx, p.id);
    let cab = st.story?.cabinet ?? null;
    if (cab && (!m || cab.mandate !== m.id)) {
      // o mandato acabou: o secretariado sai junto
      st.story!.cabinet = null;
      ctx.save("person_states", st);
      cab = null;
    }
    // quem governa e ainda não montou a equipe: o primeiro secretariado sai com técnicos e nomes do partido
    if (!cab && m) cab = cabinetOf(ctx, p, st, true);
    if (!cab || !m) continue;
    const level = levelOf(m)!;
    const tecnicos = cab.posts.filter((x) => x.kind === "TECNICO").length;
    const vagas = cab.posts.filter((x) => !x.holder).length;
    const extra = Math.max(0, cab.posts.length - baseCount(level));
    const delta = Math.round((tecnicos * 0.15 - vagas * 0.6 - extra * 0.25) * 10) / 10;
    if (delta) {
      bumpApproval(p, st, ctx.date, delta, delta > 0 ? "Equipe técnica no governo" : vagas ? "Pastas sem comando no governo" : "Máquina pública inchada");
      ctx.save("person_states", st);
    }
  }
}

/* ---------------- ações do jogador */

const NO_EXEC = "Disponível para prefeito, governador e presidente.";

function needCabinet(ctx: Ctx, p: PersonRow, st: PersonStateRow): Cabinet | string {
  const cab = cabinetOf(ctx, p, st, true);
  return cab ?? NO_EXEC;
}

const nomear: ActionDef = {
  id: "nomear_secretario",
  label: "Nomear secretário ou ministro",
  description: "Escolha quem comanda uma pasta: um técnico (gestão melhor), alguém do seu partido (agrada a direção) ou uma indicação de outro partido (a bancada dele passa a votar com o governo e fica contra um impeachment).",
  category: "MANDATO",
  energy: 5,
  params: [
    { name: "pasta", label: "Pasta", type: "cabinet_post" },
    { name: "quem", label: "Quem indica", type: "cabinet_party" },
  ],
  available: (ctx, p) => (executiveMandate(ctx, p.id) ? null : NO_EXEC),
  run: ({ ctx, p, st, params }): ActionResult => {
    const cab = needCabinet(ctx, p, st);
    if (typeof cab === "string") return { ok: false, message: cab };
    const post = cab.posts.find((x) => x.id === params.pasta);
    if (!post) return { ok: false, message: "Pasta não encontrada." };
    const tecnico = params.quem === "tecnico";
    const party = tecnico ? undefined : ctx.t.parties.get(params.quem);
    if (!tecnico && (!party || party.status !== "ATIVO")) return { ok: false, message: "Escolha um partido ativo ou um técnico." };
    const before = post.party_id && post.kind === "ALIADO" ? ctx.t.parties.get(post.party_id) : undefined;
    post.holder = holderName(ctx, `${cab.mandate}:${post.id}:${ctx.tick}:${params.quem}`);
    post.party_id = party?.id ?? null;
    post.kind = tecnico ? "TECNICO" : party!.id === p.party_id ? "PARTIDO" : "ALIADO";
    post.since = ctx.date;
    if (post.kind === "PARTIDO") st.party_standing = Math.min(100, st.party_standing + 2);
    syncFederalBase(ctx, p, cab);
    ctx.save("person_states", st);
    const who = tecnico ? "um nome técnico" : post.kind === "PARTIDO" ? `um nome do ${party!.acronym}` : `uma indicação do ${party!.acronym}`;
    const lost = before && before.id !== post.party_id && !cab.posts.some((x) => x.party_id === before.id) ? ` O ${before.acronym} perdeu o espaço no governo e se afasta.` : "";
    return { ok: true, message: `${post.holder} assume a ${post.name}: ${who}.${post.kind === "ALIADO" ? ` A bancada do ${party!.acronym} passa a andar com o governo.` : ""}${lost}` };
  },
};

const exonerar: ActionDef = {
  id: "exonerar_secretario",
  label: "Exonerar secretário ou ministro",
  description: "Tira alguém da pasta, que fica vaga até a próxima nomeação. Pasta vaga pesa na aprovação; partido que perde o espaço se afasta do governo.",
  category: "MANDATO",
  energy: 3,
  params: [{ name: "pasta", label: "Pasta", type: "cabinet_post" }],
  available: (ctx, p) => (executiveMandate(ctx, p.id) ? null : NO_EXEC),
  run: ({ ctx, p, st, params }): ActionResult => {
    const cab = needCabinet(ctx, p, st);
    if (typeof cab === "string") return { ok: false, message: cab };
    const post = cab.posts.find((x) => x.id === params.pasta);
    if (!post?.holder) return { ok: false, message: "Essa pasta já está vaga." };
    const name = post.holder;
    const party = post.party_id ? ctx.t.parties.get(post.party_id) : undefined;
    post.holder = null;
    post.party_id = null;
    post.kind = null;
    post.since = ctx.date;
    syncFederalBase(ctx, p, cab);
    ctx.save("person_states", st);
    const lost = party && party.id !== p.party_id && !cab.posts.some((x) => x.party_id === party.id) ? ` O ${party.acronym} perdeu o espaço no governo e se afasta.` : "";
    return { ok: true, message: `${name} deixou a ${post.name}. A pasta fica vaga até você nomear alguém.${lost}` };
  },
};

const criar: ActionDef = {
  id: "criar_pasta",
  label: "Criar secretaria ou ministério",
  description: "Uma pasta nova abre espaço para um tema e para mais aliados, mas custa: acima do número inicial de pastas, a máquina inchada pesa um pouco na aprovação todo mês.",
  category: "MANDATO",
  energy: 10,
  params: [{ name: "pasta", label: "Pasta nova", type: "cabinet_new" }],
  available: (ctx, p) => (executiveMandate(ctx, p.id) ? null : NO_EXEC),
  run: ({ ctx, p, st, params }): ActionResult => {
    const cab = needCabinet(ctx, p, st);
    if (typeof cab === "string") return { ok: false, message: cab };
    const level = LEVEL[cab.office]!;
    const def = catalog(level).find((c) => c.id === params.pasta);
    if (!def || cab.posts.some((x) => x.id === def.id)) return { ok: false, message: "Escolha uma pasta que ainda não existe." };
    const name = def.name;
    cab.posts.push({ id: def.id, name, holder: null, party_id: null, kind: null, since: ctx.date });
    ctx.save("person_states", st);
    const place = cab.office === "PRESIDENTE" ? "o governo federal" : geoName(cab.geo, ctx.s);
    ctx.careerNews(p.id, `${officeTitle(cab.office, genderOf(p))} cria a ${name}`, `${p.name} criou a ${name} em ${place}. A pasta começa vaga, à espera de quem a comande.`);
    return { ok: true, message: `${name} criada. Ela começa vaga: nomeie alguém para comandá-la.` };
  },
};

const extinguir: ActionDef = {
  id: "extinguir_pasta",
  label: "Extinguir secretaria ou ministério",
  description: "Fecha uma pasta: a máquina fica mais enxuta, mas quem a comandava sai, e o partido dele se afasta se perder o único espaço que tinha.",
  category: "MANDATO",
  energy: 10,
  params: [{ name: "pasta", label: "Pasta", type: "cabinet_post" }],
  available: (ctx, p) => (executiveMandate(ctx, p.id) ? null : NO_EXEC),
  run: ({ ctx, p, st, params }): ActionResult => {
    const cab = needCabinet(ctx, p, st);
    if (typeof cab === "string") return { ok: false, message: cab };
    const post = cab.posts.find((x) => x.id === params.pasta);
    if (!post) return { ok: false, message: "Pasta não encontrada." };
    if (cab.posts.length <= 3) return { ok: false, message: "O governo precisa de pelo menos 3 pastas." };
    const party = post.party_id ? ctx.t.parties.get(post.party_id) : undefined;
    cab.posts = cab.posts.filter((x) => x.id !== post.id);
    syncFederalBase(ctx, p, cab);
    if (cab.posts.length < baseCount(LEVEL[cab.office]!)) bumpApproval(p, st, ctx.date, 0.5, `Extinguiu a ${post.name}`);
    ctx.save("person_states", st);
    ctx.careerNews(p.id, `${officeTitle(cab.office, genderOf(p))} extingue a ${post.name}`, `${p.name} fechou a ${post.name}${post.holder ? `, comandada por ${post.holder}` : ""}.`);
    const lost = party && party.id !== p.party_id && !cab.posts.some((x) => x.party_id === party.id) ? ` O ${party.acronym} perdeu o espaço no governo e se afasta.` : "";
    return { ok: true, message: `${post.name} extinta.${lost}` };
  },
};

export const CABINET_ACTIONS: ActionDef[] = [nomear, exonerar, criar, extinguir];
