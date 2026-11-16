import { geoName, ufOfGeo } from "./elections";
import { relKey } from "./affiliation";
import { eraRules, OFFICES, type OfficeCode } from "./ruleset";
import type { Ctx } from "./state";
import type { CandidacyRow, PersonRow, PersonStateRow } from "./types";

/**
 * Padrinho político e dobradinha (sugestão do jogador João Vitor). Na disputa proporcional
 * (vereador e deputado), o candidato pede o apoio público de uma liderança maior do partido ou da
 * coligação: quem tem mandato acima do cargo disputado na mesma região (presidente, governador,
 * senador, deputado, prefeito da cidade) ou disputa um cargo majoritário na mesma eleição. Se ela
 * aceita, a campanha ganha força na lista proporcional à popularidade dela no estado e, em troca,
 * cede parte da estrutura (voluntários) e pede voto para o padrinho. Só personagens fictícios
 * apadrinham: pessoas reais não entram em chapa de jogador.
 */

const LIVE = ["PRE", "HOMOLOGADA", "SEGUNDO_TURNO"];
/** Parte dos voluntários que vai para a campanha do padrinho. */
const SHARE = 0.25;

export interface PatronChoice {
  person: PersonRow;
  /** "governador(a) do Ceará", "candidato(a) a prefeito(a) de Fortaleza" */
  role: string;
  /** popularidade na região da disputa (0–1) */
  popularity: number;
  /** soma na força da lista (no expoente; 0,3 ≈ 35% a mais) */
  bonus: number;
  /** a candidatura do padrinho nesta eleição, se ele disputa */
  candidacy?: CandidacyRow;
}

/** Candidatura viva do jogador (pré-candidatura ou registrada), numa eleição ainda aberta. */
export function patronCandidacy(ctx: Ctx, personId: string): CandidacyRow | undefined {
  return [...ctx.t.candidacies.values()].find((c) => c.person_id === personId && (c.status === "PRE" || c.status === "HOMOLOGADA") && ctx.t.elections.get(c.election_id)?.status !== "ENCERRADA");
}

/** Por que não dá para pedir padrinho agora (null = dá). */
export function patronBlocked(ctx: Ctx, me: PersonRow): string | null {
  const c = patronCandidacy(ctx, me.id);
  if (!c) return "Disponível com pré-candidatura ou candidatura registrada.";
  if (OFFICES[c.office_code].system !== "PROPORCIONAL") return "Padrinho político é para quem disputa vaga de vereador ou deputado.";
  const e = ctx.t.elections.get(c.election_id);
  if (e && ctx.date >= e.first_round) return "A votação já aconteceu.";
  if (c.campaign.padrinho) return `Sua campanha já tem padrinho: ${c.campaign.padrinho.name}.`;
  if (!patronChoices(ctx, me, c).length)
    return "Nenhuma liderança pode apadrinhar sua campanha agora: precisa ser alguém do seu partido com cargo acima do seu na sua região, ou quem disputa prefeitura, governo, Senado ou Presidência pelo seu partido ou com ele na coligação. Quem já recusou não é chamado de novo.";
  return null;
}

/** O cargo da liderança cobre a disputa? (o país, o estado da disputa ou a própria cidade) */
function covers(geo: string, target: string): boolean {
  return geo === "BR" || geo === target || (geo.length === 2 && ufOfGeo(target) === geo);
}

/** Popularidade da liderança na região: nome conhecido, reputação e (presidente) a aprovação do governo. */
function popularity(ctx: Ctx, x: PersonRow, uf: string): number {
  const st = ctx.pstate(x.id);
  const extra = x.office_code === "PRESIDENTE" ? ctx.world.gov.approval / 100 : x.visibility / 100;
  const v = 0.55 * (st?.reach[uf] ?? 0) + 0.25 * (x.reputation / 100) + 0.2 * extra - (st?.scandal ?? 0) / 200;
  return Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
}

function roleOf(ctx: Ctx, office: OfficeCode, geo: string, running: boolean): string {
  const name = OFFICES[office].name.toLowerCase();
  const where = geo === "BR" ? "" : ` (${geoName(geo, ctx.s)})`;
  return running ? `candidato(a) a ${name}${where}` : `${name}${where}`;
}

/**
 * Lideranças que podem apadrinhar a candidatura: fictícias, na vida pública, do partido (ou da
 * federação; para quem disputa cargo majoritário, também da coligação), com cargo ou candidatura
 * acima do cargo disputado e na mesma região. Quem já recusou não aparece de novo.
 */
export function patronChoices(ctx: Ctx, me: PersonRow, c: CandidacyRow): PatronChoice[] {
  const party = ctx.t.parties.get(c.party_id);
  if (!party) return [];
  const e = ctx.t.elections.get(c.election_id);
  const fed = eraRules(e?.year ?? Number(ctx.date.slice(0, 4))).federations ? party.federation : null;
  const sameSide = (partyId: string | null | undefined) => !!partyId && (partyId === party.id || (!!fed && ctx.t.parties.get(partyId)?.federation === fed));
  const rank = OFFICES[c.office_code].rank;
  const uf = ufOfGeo(c.geo);
  const refused = new Set(c.campaign.padrinho_refused ?? []);
  const out = new Map<string, PatronChoice>();
  const add = (x: PersonRow | undefined, office: OfficeCode, geo: string, candidacy?: CandidacyRow) => {
    if (!x || x.kind !== "FICTIONAL_GENERATED" || x.status !== "ACTIVE" || x.id === me.id || refused.has(x.id)) return;
    // quem tem mandato e também disputa aparece uma vez só, como candidato(a): é o que pede voto agora
    if (out.has(x.id) || OFFICES[office].rank <= rank || !covers(geo, c.geo)) return;
    const pop = popularity(ctx, x, uf);
    const bonus = Math.round((0.12 + 0.5 * pop) * (x.party_id === party.id ? 1 : 0.8) * 100) / 100;
    out.set(x.id, { person: x, role: roleOf(ctx, office, geo, !!candidacy), popularity: pop, bonus, candidacy });
  };
  // quem disputa cargo majoritário nesta eleição (do partido ou com o partido na coligação)
  for (const k of ctx.t.candidacies.values()) {
    if (k.election_id !== c.election_id || !LIVE.includes(k.status) || OFFICES[k.office_code].system !== "MAJORITARIO") continue;
    if (!sameSide(k.party_id) && !(k.campaign.coalition ?? []).includes(party.id)) continue;
    add(ctx.person(k.person_id), k.office_code, k.geo, k);
  }
  // quem tem mandato acima do cargo disputado
  for (const x of ctx.t.persons.values()) {
    if (!x.office_code || !x.office_geo || !sameSide(x.party_id)) continue;
    add(x, x.office_code, x.office_geo);
  }
  return [...out.values()].sort((a, b) => b.bonus - a.bonus || a.person.name.localeCompare(b.person.name, "pt-BR")).slice(0, 30);
}

/** Opções da tela: a liderança, o cargo e quanto soma. */
export function patronOptions(ctx: Ctx, me: PersonRow): Array<{ value: string; label: string }> {
  const c = patronCandidacy(ctx, me.id);
  if (!c || c.campaign.padrinho || OFFICES[c.office_code].system !== "PROPORCIONAL") return [];
  return patronChoices(ctx, me, c).map((x) => ({
    value: x.person.id,
    label: `${x.person.name} (${ctx.t.parties.get(x.person.party_id ?? "")?.acronym ?? "sem partido"}) · ${x.role} · popularidade ${Math.round(x.popularity * 100)}% · +${Math.round((Math.exp(x.bonus) - 1) * 100)}% de força`,
  }));
}

/**
 * O pedido: a liderança topa quem soma (nome conhecido, reputação, capital político e relação com
 * ela); escândalo afasta, e quanto mais popular a liderança, mais ela escolhe. Aceito, a campanha
 * ganha o bônus, cede parte dos voluntários e passa a pedir voto para o padrinho.
 */
export function askPatron(ctx: Ctx, me: PersonRow, st: PersonStateRow, patronId: string): { ok: boolean; message: string } {
  const c = patronCandidacy(ctx, me.id);
  const blocked = patronBlocked(ctx, me);
  if (!c || blocked) return { ok: false, message: blocked ?? "Disponível com pré-candidatura ou candidatura registrada." };
  const pick = patronChoices(ctx, me, c).find((x) => x.person.id === patronId);
  if (!pick) return { ok: false, message: "Essa liderança não pode apadrinhar sua campanha (não é do seu partido ou da coligação, já recusou ou deixou a vida pública)." };
  const x = pick.person;
  const uf = ufOfGeo(c.geo);
  const relation = ctx.t.relationships.get(relKey(me.id, x.id))?.score ?? 0;
  const own = x.party_id === c.party_id;
  const chance = Math.max(
    0.05,
    Math.min(0.92, 0.4 + 0.004 * relation + 0.7 * (st.reach[uf] ?? 0) + 0.004 * (me.reputation - 50) + 0.004 * (st.political_capital - 30) + (own ? 0.1 : 0) - st.scandal / 120 - 0.3 * pick.popularity),
  );
  const rel = (delta: number) => {
    const id = relKey(me.id, x.id);
    const row = ctx.t.relationships.get(id) ?? { id, world_id: ctx.world.id, a_id: me.id, b_id: x.id, score: 0, interactions: 0, last_on: ctx.date };
    row.score = Math.max(-100, Math.min(100, row.score + delta));
    row.interactions += 1;
    row.last_on = ctx.date;
    ctx.save("relationships", row);
  };
  if (!ctx.rng("padrinho", `${c.id}:${x.id}`).chance(chance)) {
    c.campaign.padrinho_refused = [...(c.campaign.padrinho_refused ?? []), x.id];
    ctx.save("candidacies", c);
    rel(-2);
    const why =
      st.scandal >= 30
        ? "não quer a imagem ligada a quem está no noticiário por escândalo"
        : relation < 10 && (st.reach[uf] ?? 0) < 0.15
          ? "mal conhece você e acha que sua candidatura ainda soma pouco voto"
          : pick.popularity >= 0.5
            ? "prefere apadrinhar nomes com mais estrada"
            : "preferiu não se comprometer com nenhuma candidatura agora";
    return { ok: false, message: `${x.name} (${pick.role}) recusou: ${why}. Você pode pedir a outra liderança.` };
  }
  c.campaign.padrinho = { id: x.id, name: x.name, role: pick.role, bonus: pick.bonus, on: ctx.date };
  // em troca: parte da estrutura vai para o padrinho, e a campanha pede voto para ele
  const give = Math.floor(c.campaign.volunteers * SHARE);
  c.campaign.volunteers -= give;
  ctx.save("candidacies", c);
  if (pick.candidacy) {
    const k = pick.candidacy;
    k.campaign.volunteers += give;
    k.campaign.momentum = Math.max(-1, Math.min(1, k.campaign.momentum + 0.02 + 0.06 * (st.reach[uf] ?? 0)));
    ctx.save("candidacies", k);
  } else {
    const xs = ctx.pstate(x.id);
    if (xs) {
      xs.reach[uf] = Math.min(0.98, (xs.reach[uf] ?? 0) + 0.01 + 0.03 * (st.reach[uf] ?? 0));
      ctx.save("person_states", xs);
    }
  }
  st.political_capital = Math.max(0, st.political_capital - 3);
  rel(8);
  const gain = Math.round((Math.exp(pick.bonus) - 1) * 100);
  const office = OFFICES[c.office_code].name.toLowerCase();
  return {
    ok: true,
    message: `${x.name} (${pick.role}) topou ser seu padrinho político: agora você é o(a) ${office} de ${x.name.split(" ")[0]}. Sua força na lista do partido sobe cerca de ${gain}%${give ? ` e ${give} voluntário(s) seus passam a fazer campanha ${pick.candidacy ? "para o padrinho" : "junto com o padrinho"}` : ""}; em troca, sua campanha pede voto para ${pick.candidacy ? "a candidatura dele(a)" : "o grupo dele(a)"}.`,
  };
}
