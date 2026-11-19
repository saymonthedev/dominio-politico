import { describe, expect, it } from "vitest";
import {
  addDays,
  chamberSeats,
  createCharacter,
  Ctx,
  dailyVotes,
  diffDays,
  fileImpeachment,
  impeachmentSupportFor,
  monthlyImpeachments,
  openImpeachmentOf,
  performAction,
  runTicks,
  spawnProceduralCadre,
  type BillRow,
  type MandateRow,
  type OfficeCode,
  type PersonRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

let n = 0;

function bill(state: WorldState, over: Partial<BillRow> = {}): BillRow {
  const b: BillRow = {
    id: `bill_t_${++n}`,
    world_id: state.world.id,
    chamber: "CAMARA",
    title: "PL de teste do painel",
    summary: "Projeto de teste.",
    axis: "economy",
    direction: 1,
    author_party_id: null,
    author_person_id: null,
    gov_position: 0,
    vote_on: state.world.game_date,
    status: "TRAMITANDO",
    votes: { yes: 0, no: 0, abstain: 0 },
    player_votes: {},
    fiscal_effect: 0,
    ...over,
  };
  state.t.bills.set(b.id, b);
  return b;
}

/** Dá um cargo a alguém (mandato em exercício até 2030). */
function seat(state: WorldState, p: PersonRow, office: OfficeCode, geo: string, approval = 50): MandateRow {
  if (office === "PREFEITO" || office === "GOVERNADOR" || office === "PRESIDENTE") {
    for (const x of state.t.mandates.values()) if (x.status === "ATIVO" && x.office_code === office && x.geo === geo) x.status = "ENCERRADO";
  }
  const m: MandateRow = { id: `mand_t_${++n}`, world_id: state.world.id, person_id: p.id, office_code: office, geo, start_on: state.world.game_date, end_on: "2030-12-31", status: "ATIVO", election_id: null, approval };
  state.t.mandates.set(m.id, m);
  p.office_code = office;
  p.office_geo = geo;
  p.stage = "MANDATO";
  return m;
}

function player(state: WorldState, name: string, uf = "SP"): PersonRow {
  const ctx = new Ctx(state, `action:${name}`);
  const r = createCharacter(ctx, { userId: `00000000-0000-0000-0000-${String(++n).padStart(12, "0")}`, name, uf, age: 40, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
  expect(r.ok, r.error).toBe(true);
  return r.person!;
}

/** O partido com menos cadeiras na Assembleia de SP (quem governa fica com pouca gente para se defender). */
function smallParty(state: WorldState) {
  return [...state.t.parties.values()].filter((p) => p.status === "ATIVO").sort((a, b) => (a.seats.assembleia_SP ?? 0) - (b.seats.assembleia_SP ?? 0) || a.id.localeCompare(b.id))[0];
}

describe("plenário: painel de votação e Senado (sugestão do jogador Gabriel do Valle)", () => {
  it("o projeto vota com painel completo na Câmara e, aprovado, vai ao Senado, que vota com os 81", () => {
    const { state } = freshWorld("painel");
    const seats = chamberSeats(new Ctx(state, "tick"), "CAMARA").reduce((s, x) => s + x.seats, 0);
    expect(seats).toBe(513);
    // os dois sentidos do mesmo tema: um deles passa na Câmara
    const a = bill(state, { direction: 1 });
    const b = bill(state, { direction: -1 });
    dailyVotes(new Ctx(state, "tick"));
    for (const x of [a, b]) {
      const panel = x.votes.panels![0];
      expect(panel.seats).toBe(513);
      expect(panel.yes + panel.no + panel.abstain + panel.absent).toBe(513);
      expect(panel.parties.reduce((s, p) => s + p.seats, 0)).toBe(513);
      expect(panel.house).toBe("Câmara dos Deputados");
    }
    const passed = [a, b].find((x) => x.votes.panels![0].approved)!;
    expect(passed, "um dos dois sentidos passa").toBeTruthy();
    expect(passed.chamber).toBe("SENADO");
    expect(passed.status).toBe("TRAMITANDO");
    expect(passed.vote_on > state.world.game_date).toBe(true);
    state.world.game_date = passed.vote_on;
    dailyVotes(new Ctx(state, "tick"));
    expect(passed.status === "APROVADO" || passed.status === "REJEITADO").toBe(true);
    const senate = passed.votes.panels![1];
    expect(senate.house).toBe("Senado Federal");
    expect(senate.seats).toBe(81);
  });

  it("o jogador vota só na própria Casa e o voto aparece no painel", () => {
    const { state } = freshWorld("painel-jogador");
    const me = player(state, "Deputada Teste");
    seat(state, me, "DEP_FEDERAL", "SP");
    const b = bill(state, { vote_on: addDays(state.world.game_date, 3) });
    const senado = bill(state, { chamber: "SENADO", vote_on: addDays(state.world.game_date, 3) });
    const ctx = new Ctx(state, "action:voto");
    expect(performAction(ctx, me.id, "votar_projeto", { bill: senado.id, vote: "SIM" }).ok).toBe(false);
    expect(performAction(ctx, me.id, "votar_projeto", { bill: b.id, vote: "NAO" }).ok).toBe(true);
    state.world.game_date = b.vote_on;
    dailyVotes(new Ctx(state, "tick"));
    expect(b.votes.panels![0].players[me.id]).toBe("NAO");
  });
});

describe("impeachment (sugestão do jogador Gabriel do Valle)", () => {
  it("pessoa real nunca é alvo, nem com o governo em frangalhos", () => {
    const { state } = freshWorld("imp-real");
    state.world.gov.approval = 3;
    for (const m of state.t.mandates.values()) m.approval = 2;
    for (let i = 0; i < 12; i++) {
      state.world.tick += 30;
      monthlyImpeachments(new Ctx(state, "tick"));
    }
    const opened = [...state.t.bills.values()].filter((b) => b.axis === "impeachment");
    for (const b of opened) expect(state.t.persons.get(b.votes.impeachment!.target)!.kind).not.toMatch(/^REAL/);
  });

  it("governador fictício impopular: a Assembleia vota, ele sai inelegível e o vice assume", () => {
    const { state } = freshWorld("imp-gov");
    const ctx = new Ctx(state, "setup");
    const party = smallParty(state);
    const gov = spawnProceduralCadre(ctx, { partyId: party.id, uf: "SP", ideology: party.ideology, roleLabel: "governador de teste" });
    const m = seat(state, gov, "GOVERNADOR", "SP", 2);
    const st = state.t.person_states.get(gov.id)!;
    st.scandal = 90;
    const b = fileImpeachment(ctx, gov, m, "aprovação de 2%", null);
    expect(b.chamber).toBe("ASSEMBLEIA:SP");
    expect(openImpeachmentOf(ctx, gov.id)?.id).toBe(b.id);
    state.world.game_date = b.vote_on;
    dailyVotes(new Ctx(state, "tick"));
    const panel = b.votes.panels![0];
    expect(panel.house).toContain("Assembleia Legislativa");
    expect(panel.needed).toBe(Math.ceil((panel.seats * 2) / 3));
    expect(panel.approved).toBe(true);
    expect(b.status).toBe("APROVADO");
    expect(m.status).toBe("ENCERRADO");
    expect(gov.office_code).toBeNull();
    expect(st.ineligible_until! > state.world.game_date).toBe(true);
    const vice = [...state.t.mandates.values()].find((x) => x.status === "ATIVO" && x.office_code === "GOVERNADOR" && x.geo === "SP" && x.person_id !== gov.id)!;
    expect(vice, "o vice assumiu").toBeTruthy();
    expect(vice.end_on).toBe("2030-12-31");
  });

  it("presidente fictício: a Câmara admite e o Senado julga", () => {
    const { state } = freshWorld("imp-pres");
    const ctx = new Ctx(state, "setup");
    const party = [...state.t.parties.values()].filter((p) => p.status === "ATIVO").sort((a, b) => (a.seats.camara ?? 0) - (b.seats.camara ?? 0))[0];
    const pres = spawnProceduralCadre(ctx, { partyId: party.id, uf: "DF", ideology: party.ideology, roleLabel: "presidente de teste" });
    const m = seat(state, pres, "PRESIDENTE", "BR");
    state.world.gov.president_id = pres.id;
    state.world.gov.base_party_ids = [party.id];
    state.world.gov.approval = 3;
    const b = fileImpeachment(ctx, pres, m, "aprovação de 3%", null);
    expect(b.chamber).toBe("CAMARA");
    state.world.game_date = b.vote_on;
    dailyVotes(new Ctx(state, "tick"));
    expect(b.votes.panels![0].step).toBe("Admissão do processo");
    expect(b.votes.panels![0].approved).toBe(true);
    expect(b.chamber).toBe("SENADO");
    state.world.game_date = b.vote_on;
    dailyVotes(new Ctx(state, "tick"));
    expect(b.votes.panels![1].seats).toBe(81);
    if (b.status === "APROVADO") expect(state.world.gov.president_id).not.toBe(pres.id);
  });

  it("o jogador vereador pede o impeachment do prefeito, e a articulação e os aliados tiram votos", () => {
    const { state } = freshWorld("imp-jogador");
    const me = player(state, "Vereadora Teste");
    const city = me.municipality;
    seat(state, me, "VEREADOR", city);
    const mayor = player(state, "Prefeito Teste");
    const m = seat(state, mayor, "PREFEITO", city, 50);
    const stMayor = state.t.person_states.get(mayor.id)!;
    stMayor.story!.approval = 50;
    const ctx = new Ctx(state, "action:imp");
    // com 50% de aprovação e sem escândalo, a Câmara arquiva o pedido
    const r1 = performAction(ctx, me.id, "pedir_impeachment", {});
    expect(r1.ok).toBe(true);
    expect(openImpeachmentOf(ctx, mayor.id)).toBeNull();
    stMayor.story!.approval = 8;
    const r2 = performAction(new Ctx(state, "action:imp2"), me.id, "pedir_impeachment", {});
    expect(r2.ok, r2.message).toBe(true);
    const b = openImpeachmentOf(new Ctx(state, "tick"), mayor.id)!;
    expect(b.chamber).toBe(`MUNICIPAL:${city}`);
    expect(performAction(new Ctx(state, "action:v"), me.id, "votar_projeto", { bill: b.id, vote: "SIM" }).ok).toBe(true);
    // o prefeito (jogador) dá uma secretaria a um partido e articula: a bancada dele apoia menos
    const other = [...state.t.parties.values()].filter((p) => p.status === "ATIVO" && p.id !== mayor.party_id).sort((a, b2) => a.id.localeCompare(b2.id))[0];
    const before = impeachmentSupportFor(new Ctx(state, "tick"), mayor.id, other.id)!;
    expect(performAction(new Ctx(state, "action:n"), mayor.id, "nomear_secretario", { pasta: "saude", quem: other.id }).ok).toBe(true);
    stMayor.political_capital = 50;
    expect(performAction(new Ctx(state, "action:a"), mayor.id, "articular_contra_impeachment", {}).ok).toBe(true);
    const after = impeachmentSupportFor(new Ctx(state, "tick"), mayor.id, other.id)!;
    expect(after).toBeLessThan(before - 0.2);
    expect(m.status).toBe("ATIVO");
  });
});

describe("secretariado e ministérios (sugestão do jogador Gabriel do Valle)", () => {
  it("prefeita nomeia, exonera, cria e extingue pastas", () => {
    const { state } = freshWorld("secretariado");
    const me = player(state, "Prefeita Teste");
    seat(state, me, "PREFEITO", me.municipality);
    const act = (id: string, params: Record<string, string>) => performAction(new Ctx(state, `action:${id}:${++n}`), me.id, id, params);
    const st = state.t.person_states.get(me.id)!;
    expect(act("nomear_secretario", { pasta: "educacao", quem: "tecnico" }).ok).toBe(true);
    const cab = st.story!.cabinet!;
    expect(cab.posts.length).toBe(6);
    expect(cab.posts.find((x) => x.id === "educacao")!.kind).toBe("TECNICO");
    expect(act("criar_pasta", { pasta: "cultura" }).ok).toBe(true);
    expect(cab.posts.find((x) => x.id === "cultura")!.holder).toBeNull();
    expect(act("exonerar_secretario", { pasta: "saude" }).ok).toBe(true);
    expect(cab.posts.find((x) => x.id === "saude")!.holder).toBeNull();
    expect(act("extinguir_pasta", { pasta: "cultura" }).ok).toBe(true);
    expect(cab.posts.some((x) => x.id === "cultura")).toBe(false);
    // quem não governa não tem secretariado
    const other = player(state, "Cidadã Teste");
    expect(performAction(new Ctx(state, "action:x"), other.id, "nomear_secretario", { pasta: "saude", quem: "tecnico" }).ok).toBe(false);
  });

  it("presidente jogador: partido com ministério entra na base do governo", () => {
    const { state } = freshWorld("ministerios");
    const me = player(state, "Presidente Teste", "DF");
    seat(state, me, "PRESIDENTE", "BR");
    state.world.gov.president_id = me.id;
    const far = [...state.t.parties.values()].filter((p) => p.status === "ATIVO" && p.gov_alignment === -1)[0] ?? [...state.t.parties.values()].find((p) => p.status === "ATIVO")!;
    const r = performAction(new Ctx(state, "action:min"), me.id, "nomear_secretario", { pasta: "saude", quem: far.id });
    expect(r.ok, r.message).toBe(true);
    expect(state.t.person_states.get(me.id)!.story!.cabinet!.posts.length).toBe(14);
    expect(state.world.gov.base_party_ids).toContain(far.id);
    expect(far.gov_alignment).toBe(1);
  });

  it("o mês do governo corre sem erro com secretariado e impeachment no calendário", () => {
    const { state } = freshWorld("secretariado-mes");
    const me = player(state, "Governadora Teste");
    seat(state, me, "GOVERNADOR", "SP");
    performAction(new Ctx(state, "action:g"), me.id, "nomear_secretario", { pasta: "saude", quem: "tecnico" });
    const days = diffDays("2027-03-02", state.world.game_date);
    const { ctx } = runTicks(state, { target: state.world.tick + days, maxTicks: days, tolerant: true });
    expect(ctx.faults.map((f) => `${f.step}: ${f.error.message}`)).toEqual([]);
  });
});
