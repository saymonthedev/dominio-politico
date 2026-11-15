import { diffDays } from "../../calendar";
import type { PartyRow, PersonRow } from "../../types";
import type { StoryCtx } from "../context";
import type { Binding } from "../types";
import { canAct, cityOf, findFigure } from "../world";
import { ev } from "./cotidiano";
import { actor, first, partyOf } from "./util";

/**
 * Eleição da Mesa Diretora (sugestão do jogador João Vitor): a cada dois anos, cada Casa legislativa
 * elege quem a preside. Câmaras municipais votam em 1º de janeiro dos anos ímpares (início de cada
 * biênio); Assembleias, Câmara dos Deputados e Senado, em 1º de fevereiro dos anos ímpares.
 *
 * Quem tem mandato na Casa (ou toma posse no dia) é chamado a disputar: lança candidatura, forma
 * bloco e vai a voto contra o favorito da Casa. Quem vence comanda a pauta (projetos próprios passam
 * com mais facilidade), distribui as comissões entre aliados e ganha pontos no ranking da carreira.
 * O rival é sempre um político fictício: pessoas reais não entram nas histórias.
 */

type Casa = "VEREADOR" | "DEP_ESTADUAL" | "DEP_FEDERAL" | "SENADOR";

interface CasaInfo {
  /** "Câmara dos Deputados" */
  name: string;
  /** artigo com "de": "da" / "do" */
  de: string;
  /** dia e mês da eleição da Mesa (anos ímpares) */
  day: string;
  /** colegas na Casa, para os textos */
  member: string;
  /** chave das cadeiras do partido (só nas Casas federais, que o jogo conta) */
  seats?: string;
  total?: number;
}

const CASAS: Record<Casa, CasaInfo> = {
  VEREADOR: { name: "Câmara Municipal", de: "da", day: "01-01", member: "vereador(a)" },
  DEP_ESTADUAL: { name: "Assembleia Legislativa", de: "da", day: "02-01", member: "deputado(a) estadual" },
  DEP_FEDERAL: { name: "Câmara dos Deputados", de: "da", day: "02-01", member: "deputado(a) federal", seats: "camara", total: 513 },
  SENADOR: { name: "Senado Federal", de: "do", day: "02-01", member: "senador(a)", seats: "senado", total: 81 },
};

const isCasa = (code: string | null | undefined): code is Casa => !!code && code in CASAS;
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const dm = (iso: string) => `${Number(iso.slice(8, 10)) === 1 ? "1º" : Number(iso.slice(8, 10))} de ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
const casaOf = (b: Binding): Casa => String(b.casa) as Casa;
const pctOf = (b: Binding) => Math.max(5, Math.min(85, Number(b.odds) || 5));

/**
 * Presidência em curso: a Casa que o jogador preside, se ainda estiver no biênio e no mandato.
 * Usado pela pauta do gabinete e pela disputa de comissões.
 */
export function presidesHouse(c: StoryCtx): boolean {
  const v = c.flag("mesa_pres");
  if (typeof v !== "string") return false;
  const [casa, until] = v.split("|");
  return c.p.office_code === casa && c.date < until;
}

/** A próxima eleição da Mesa em que o jogador vota (de 5 a 25 dias à frente). */
function nextMesa(c: StoryCtx): { casa: Casa; d: string } | null {
  const y = Number(c.date.slice(0, 4));
  for (const m of c.ctx.t.mandates.values()) {
    if (m.person_id !== c.p.id || m.status === "ENCERRADO" || !isCasa(m.office_code)) continue;
    for (const year of [y, y + 1]) {
      if (year % 2 === 0) continue;
      const d = `${year}-${CASAS[m.office_code].day}`;
      const days = diffDays(d, c.date);
      if (days >= 5 && days <= 25 && m.start_on <= d && m.end_on > d) return { casa: m.office_code, d };
    }
  }
  return null;
}

/** O jogador tem cadeira na Casa no dia da eleição (mandato em curso ou tomando posse nele)? */
function seated(c: StoryCtx, casa: string, d: string): boolean {
  for (const m of c.ctx.t.mandates.values()) {
    if (m.person_id === c.p.id && m.office_code === casa && m.status !== "ENCERRADO" && m.start_on <= d && m.end_on > d) return true;
  }
  return false;
}

/** Colegas fictícios da mesma Casa (mesma cidade, estado ou país, conforme a Casa). */
function colleagues(c: StoryCtx, casa: Casa): PersonRow[] {
  const here = cityOf(c.p);
  return [...c.ctx.t.persons.values()]
    .filter((x) => canAct(x) && x.id !== c.p.id && x.office_code === casa && (casa === "VEREADOR" ? cityOf(x) === here : casa === "DEP_ESTADUAL" ? x.uf === c.p.uf : true))
    .sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id));
}

/** Maior partido da Casa fora o do jogador (bancada federal, ou presença no estado). */
function biggestRival(c: StoryCtx, casa: Casa): PartyRow | undefined {
  const key = CASAS[casa].seats;
  return [...c.ctx.t.parties.values()]
    .filter((x) => x.status === "ATIVO" && x.id !== c.p.party_id && !x.founder_id)
    .sort((a, b) => (key ? (b.seats[key] ?? 0) - (a.seats[key] ?? 0) : 0) || (b.territory[c.p.uf] ?? 0) - (a.territory[c.p.uf] ?? 0))[0];
}

/** O favorito da Casa: o colega fictício de outro partido com mais reputação, ou um veterano. */
function favorite(c: StoryCtx, casa: Casa): PersonRow {
  const other = colleagues(c, casa).find((x) => x.party_id && x.party_id !== c.p.party_id);
  if (other) return other;
  const party = biggestRival(c, casa);
  return findFigure(c.ctx, c.p, `mesa:${casa}`, `${CASAS[casa].member} veterano(a), favorito(a) à presidência ${CASAS[casa].de} ${CASAS[casa].name}`, {
    partyId: party?.id ?? null,
    ideology: party?.ideology,
    age: [46, 70],
    reputation: 55,
  });
}

/** Chance de vencer antes da articulação: capital, reputação, bancada, carisma e força do favorito. */
function startOdds(c: StoryCtx, casa: Casa, rival: PersonRow): number {
  const info = CASAS[casa];
  const bench = info.seats && info.total && c.party ? (c.party.seats[info.seats] ?? 0) / info.total : (c.party?.territory[c.p.uf] ?? 0.05) * 0.6;
  const odds = 0.06 + c.st.political_capital / 250 + c.p.reputation / 400 + Math.min(0.3, bench * 0.8) + c.charisma * 0.08 - rival.reputation / 500;
  return Math.max(0.05, Math.min(0.6, odds));
}

const mesa_disputa = ev({
  id: "mesa_disputa",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  family: "mesa",
  weight: 40,
  cooldown: 300,
  expires: 6,
  when: (c) => {
    const n = nextMesa(c);
    if (!n || c.flag(`mesa:${n.d}`)) return null;
    const rival = favorite(c, n.casa);
    return { casa: n.casa, d: n.d, rival: rival.id, odds: Math.round(startOdds(c, n.casa, rival) * 100) };
  },
  valid: (c, b) => diffDays(String(b.d), c.date) >= 2,
  who: (c, b) => actor(c, b.rival),
  title: (_c, b) => `Eleição da Mesa: presidência ${CASAS[casaOf(b)].de} ${CASAS[casaOf(b)].name}`,
  text: (c, b) => {
    const info = CASAS[casaOf(b)];
    const rival = actor(c, b.rival);
    const party = partyOf(c, rival?.party_id ?? undefined);
    return `Em ${dm(String(b.d))}, ${info.de === "do" ? "o" : "a"} ${info.name} elege a Mesa Diretora para os próximos dois anos. Quem preside decide o que entra na pauta de votação, distribui as comissões e fala pela Casa. O favorito é ${rival?.name ?? "um veterano"}${party ? ` (${party.acronym})` : ""}, com o apoio das maiores bancadas. Sua contagem de votos hoje: ${pctOf(b)}% de chance.`;
  },
  opts: [
    {
      id: "lancar",
      label: "Lançar candidatura à presidência",
      hint: "Vai precisar formar um bloco; perder tem custo",
      tone: "risky",
      cost: () => ({ energy: 15 }),
      requires: (c) => (c.st.political_capital >= 10 ? null : "Precisa de pelo menos 10 de capital político para ser levado a sério"),
      run: (c, b, fx) => {
        fx.flag(`mesa:${b.d}`, "candidato");
        fx.visibility(1);
        fx.schedule("mesa_articulacao", Math.max(1, diffDays(String(b.d), c.date) - 4), { casa: String(b.casa), d: String(b.d), rival: String(b.rival), odds: pctOf(b) });
        return `Candidatura lançada. A partir de agora é telefone, café no gabinete dos colegas e conta de votos todo dia até ${dm(String(b.d))}.`;
      },
    },
    {
      id: "apoiar",
      label: "Apoiar o favorito em troca de um cargo na Mesa",
      hint: "Capital político e um aliado forte",
      tone: "safe",
      run: (c, b, fx) => {
        fx.flag(`mesa:${b.d}`, "apoio");
        fx.capital(4);
        fx.visibility(0.5);
        if (b.rival) fx.rel(String(b.rival), 10);
        return `Você fechou com ${first(actor(c, b.rival))} e ficou com uma secretaria da Mesa. Pouco holofote, mas lugar na mesa onde se decide a pauta.`;
      },
    },
    {
      id: "fora",
      label: "Ficar de fora da disputa",
      tone: "neutral",
      run: (_c, b, fx) => {
        fx.flag(`mesa:${b.d}`, "fora");
        return "Você votou e voltou para o gabinete. A Mesa foi decidida sem você no meio.";
      },
    },
  ],
  fallback: "fora",
});

const mesa_articulacao = ev({
  id: "mesa_articulacao",
  kind: "DECISAO",
  tags: ["MANDATO", "BASTIDORES"],
  chained: true,
  expires: 3,
  when: (c, d) => (d && isCasa(String(d.casa)) && seated(c, String(d.casa), String(d.d)) ? d : null),
  who: (c, b) => actor(c, b.rival),
  title: (_c, b) => `Formação de blocos para a presidência ${CASAS[casaOf(b)].de} ${CASAS[casaOf(b)].name}`,
  text: (c, b) =>
    `Faltam poucos dias para o voto. ${first(actor(c, b.rival)) || "O favorito"} já tem as maiores bancadas; para virar o jogo, você precisa montar um bloco. Contagem de votos agora: ${pctOf(b)}% de chance. Como você vai buscar o resto?`,
  opts: [
    {
      id: "centro",
      label: "Negociar com as bancadas do centro: cargos na Mesa e relatorias",
      hint: "Muitos votos, custa capital político",
      tone: "bold",
      run: (c, b, fx) => {
        fx.capital(-6);
        fx.schedule("mesa_votacao", Math.max(1, diffDays(String(b.d), c.date)), { ...b, odds: pctOf(b) + 16 });
        return "Vice-presidência para um, relatoria do orçamento para outro. O bloco cresceu — e a fila de quem cobra a fatura também.";
      },
    },
    {
      id: "partido",
      label: "Fechar o apoio do seu partido e dos aliados de sempre",
      hint: "Votos firmes, sem prometer cargo",
      tone: "safe",
      run: (c, b, fx) => {
        fx.standing(2);
        fx.schedule("mesa_votacao", Math.max(1, diffDays(String(b.d), c.date)), { ...b, odds: pctOf(b) + 9 });
        return "Reunião de bancada, fotografia com os aliados e voto fechado. Menos gente, mas ninguém vai mudar de lado na última hora.";
      },
    },
    {
      id: "independencia",
      label: "Prometer independência e pauta aberta para todos",
      hint: "Agrada oposição e indecisos; irrita o favorito",
      tone: "bold",
      run: (c, b, fx) => {
        fx.reputation(1);
        if (b.rival) fx.rel(String(b.rival), -5);
        fx.schedule("mesa_votacao", Math.max(1, diffDays(String(b.d), c.date)), { ...b, odds: pctOf(b) + 11 });
        return "Seu discurso de \"Casa independente\" circulou nos grupos. Quem se sentia esquecido pela Mesa atual prestou atenção.";
      },
    },
    {
      id: "corpo",
      label: "Corpo a corpo: gabinete por gabinete",
      hint: "Cansa, mas convence um por um",
      tone: "neutral",
      cost: () => ({ energy: 20 }),
      run: (c, b, fx) => {
        fx.schedule("mesa_votacao", Math.max(1, diffDays(String(b.d), c.date)), { ...b, odds: pctOf(b) + 12 });
        return "Dias de corredor, cafezinho e conversa olho no olho. Alguns votos que ninguém contava agora têm o seu nome.";
      },
    },
  ],
  fallback: "partido",
});

const mesa_votacao = ev({
  id: "mesa_votacao",
  kind: "INFO",
  tags: ["MANDATO"],
  chained: true,
  blocking: true,
  milestone: true,
  when: (c, d) => (d && isCasa(String(d.casa)) && seated(c, String(d.casa), String(d.d)) ? d : null),
  who: (c, b) => actor(c, b.rival),
  title: (_c, b) => `Votação para a presidência ${CASAS[casaOf(b)].de} ${CASAS[casaOf(b)].name}`,
  text: (c, b) => `O painel foi aberto. Você contra ${actor(c, b.rival)?.name ?? "o favorito"}, voto a voto.`,
  opts: [
    {
      id: "ok",
      label: "Ver o resultado",
      run: (c, b, fx) => {
        const casa = casaOf(b);
        const info = CASAS[casa];
        const rival = actor(c, b.rival);
        if (c.roll(pctOf(b) / 100)) {
          // vale até a eleição do biênio seguinte, dois anos depois
          fx.flag("mesa_pres", `${casa}|${Number(String(b.d).slice(0, 4)) + 2}${String(b.d).slice(4)}`);
          fx.flag("mesa_presidiu", casa);
          if (casa === "DEP_FEDERAL" || casa === "SENADOR") fx.flag("mesa_presidiu_federal", casa);
          fx.capital(10);
          fx.visibility(3);
          fx.reputation(2);
          if (rival) fx.rel(rival.id, -6);
          // as comissões ficam com quem ajudou
          for (const ally of colleagues(c, casa).filter((x) => x.id !== rival?.id).slice(0, 3)) fx.rel(ally.id, 6);
          fx.news(`${c.p.name} é eleito(a) presidente ${info.de} ${info.name}`, `${c.p.name}${c.party ? ` (${c.party.acronym})` : ""} vai comandar a pauta ${info.de} ${info.name} pelos próximos dois anos.`);
          return `Vitória! Você preside ${info.de === "do" ? "o" : "a"} ${info.name} pelos próximos dois anos: a pauta passa pela sua mesa, seus projetos andam mais rápido e as comissões ficam com os aliados.`;
        }
        fx.capital(-4);
        if (rival) fx.rel(rival.id, -4);
        return `Derrota. ${rival ? first(rival) : "O favorito"} levou a presidência, e quem votou com você vai ficar longe dos cargos por dois anos. Daqui a dois anos tem outra eleição.`;
      },
    },
  ],
  fallback: "ok",
});

export const MESA_EVENTS = [mesa_disputa, mesa_articulacao, mesa_votacao];
