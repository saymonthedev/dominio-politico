import { describe, expect, it } from "vitest";
import {
  annualMortality,
  careerSummary,
  createCharacter,
  Ctx,
  endCareer,
  joinParty,
  pendingBlocking,
  performAction,
  resolveStory,
  runTicks,
  scheduleStory,
  stepDays,
  STORY_DEFS,
  StoryCtx,
  storyOf,
  tallyMajoritarian,
  type StoryEvent,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

function player(seed: string, opts: { age?: number; uf?: string } = {}) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, {
    userId: "00000000-0000-0000-0000-000000000077",
    name: "Lia Teste",
    uf: opts.uf ?? "PE",
    age: opts.age ?? 34,
    profession: "professor",
    origin: "classe_media",
    interests: [],
    ideology: { economy: -15, social: -10 },
  });
  expect(r.ok, r.error).toBe(true);
  const p = r.person!;
  return { state, p, st: state.t.person_states.get(p.id)! };
}

/** Responde como um jogador: primeira escolha disponível (ou a indicada). */
function decide(state: WorldState, personId: string, ev: StoryEvent, pick?: (ev: StoryEvent) => string) {
  const seq = state.t.person_states.get(personId)!.action_seq;
  const ctx = new Ctx(state, `action:${personId}:${seq}`);
  const choice = pick?.(ev) ?? ev.choices.find((c) => !c.locked)?.id ?? ev.choices[0]?.id ?? "ok";
  return resolveStory(ctx, personId, ev.id, choice);
}

/** Vive `total` dias respondendo cada decisão que segura o tempo. */
function live(state: WorldState, personId: string, total: number, pick?: (ev: StoryEvent) => string) {
  let done = 0;
  let stops = 0;
  let guard = 0;
  while (done < total && guard++ < total * 3) {
    const r = stepDays(state, personId, { days: total - done });
    done += r.ticks;
    const st = state.t.person_states.get(personId)!;
    if (r.stop === "fim") break;
    const ev = pendingBlocking(st.story);
    if (ev) {
      stops++;
      const out = decide(state, personId, ev, pick);
      expect(out.ok, out.message).toBe(true);
    }
  }
  return { done, stops };
}

describe("acontecimentos da carreira", () => {
  it("o catálogo é coerente: ids únicos, textos e escolhas", () => {
    const defs = Object.values(STORY_DEFS);
    expect(defs.length).toBeGreaterThan(60);
    for (const d of defs) {
      expect(STORY_DEFS[d.id]).toBe(d);
      expect(d.tags.length).toBeGreaterThan(0);
    }
  });

  it("quem vive os dias recebe acontecimentos variados, com pausas nas decisões", () => {
    const { state, p } = player("story-ritmo");
    const { done, stops } = live(state, p.id, 150);
    expect(done).toBe(150);
    const s = storyOf(state.t.person_states.get(p.id)!);
    const defs = new Set(s.log.map((e) => e.def));
    expect(s.log.length).toBeGreaterThanOrEqual(8);
    expect(s.log.length).toBeLessThan(90);
    expect(defs.size).toBeGreaterThanOrEqual(5);
    expect(stops).toBeGreaterThan(0);
    expect(s.pending.length).toBeLessThanOrEqual(4);
    // sem repetição do mesmo acontecimento dentro do intervalo mínimo
    const byDef = new Map<string, string[]>();
    for (const e of s.log.filter((x) => !STORY_DEFS[x.def]?.chained)) byDef.set(e.def, [...(byDef.get(e.def) ?? []), e.on]);
    for (const [def, dates] of byDef) {
      const sorted = [...dates].sort();
      for (let i = 1; i < sorted.length; i++) {
        const gap = (Date.parse(sorted[i]) - Date.parse(sorted[i - 1])) / 86_400_000;
        expect(gap, def).toBeGreaterThanOrEqual(STORY_DEFS[def].cooldown ?? 60);
      }
    }
  });

  it("quem não está jogando não recebe acontecimentos sorteados", () => {
    const { state, p } = player("story-ausente");
    runTicks(state, { target: state.world.tick + 90, maxTicks: 90 });
    const s = storyOf(state.t.person_states.get(p.id)!);
    expect(s.log.filter((e) => !STORY_DEFS[e.def]?.chained && e.def !== "fim_da_carreira")).toHaveLength(0);
  });

  it("o tempo para numa decisão e só segue depois da resposta", () => {
    const { state, p, st } = player("story-pausa");
    const ctx = new Ctx(state, "tick");
    const c = new StoryCtx(ctx, p, st, ctx.rng("t", p.id));
    scheduleStory(st, "despesa_inesperada", state.world.game_date, {});
    // a despesa é contextual; para forçar, dispara pelo encadeamento de teste
    const def = STORY_DEFS.despesa_inesperada;
    const b = def.when(c)!;
    storyOf(st).queue = [];
    storyOf(st).pending.push({
      id: "sty_teste",
      def: def.id,
      on: state.world.game_date,
      expires: "2099-01-01",
      kind: "DECISAO",
      blocking: true,
      tags: def.tags,
      title: "Teste",
      text: "",
      choices: def.render(c, b).choices.map((x) => ({ id: x.id, label: x.label })),
      data: b,
      fallback: "parcelar",
    });
    const tick = state.world.tick;
    const r1 = stepDays(state, p.id, { days: 7 });
    expect(r1.stop).toBe("decisao");
    expect(r1.ticks).toBe(0);
    expect(state.world.tick).toBe(tick);
    const out = decide(state, p.id, storyOf(st).pending[0], () => "pagar");
    expect(out.ok).toBe(true);
    expect(storyOf(st).pending.find((e) => e.id === "sty_teste")).toBeUndefined();
    const r2 = stepDays(state, p.id, { days: 3 });
    expect(r2.ticks).toBeGreaterThan(0);
    expect(r2.days[0].weekday).toBeTruthy();
    expect(r2.days[0].line.length).toBeGreaterThan(5);
  });

  it("decisão sem resposta vence o prazo e aplica a escolha padrão", () => {
    const { state, p, st } = player("story-prazo");
    const s = storyOf(st);
    s.pending.push({
      id: "sty_prazo",
      def: "despesa_inesperada",
      on: state.world.game_date,
      expires: state.world.game_date,
      kind: "DECISAO",
      blocking: true,
      tags: ["DINHEIRO"],
      title: "O carro quebrou",
      text: "",
      choices: [
        { id: "pagar", label: "Pagar" },
        { id: "parcelar", label: "Parcelar" },
      ],
      data: { k: "carro", t: "O carro quebrou", d: "x", v: 3000 },
      fallback: "parcelar",
    });
    const debt = st.debt;
    runTicks(state, { target: state.world.tick + 2, maxTicks: 2 });
    expect(s.pending.find((e) => e.id === "sty_prazo")).toBeUndefined();
    const entry = s.log.find((e) => e.id === "sty_prazo")!;
    expect(entry.auto).toBe(true);
    expect(entry.choice).toBe("parcelar");
    expect(st.debt).toBeGreaterThan(debt);
  });

  it("histórias encadeadas: o evento do bairro leva à liderança, ao projeto e, meses depois, ao partido", () => {
    const { state, p, st } = player("story-corrente");
    const ctx = new Ctx(state, "tick");
    const c = new StoryCtx(ctx, p, st, ctx.rng("t", p.id));
    const s = storyOf(st);
    const def = STORY_DEFS.evento_comunitario;
    const b = def.when(c)!;
    s.pending.push({ id: "sty_bairro", def: def.id, on: state.world.game_date, expires: "2099-01-01", kind: "OPORTUNIDADE", blocking: false, tags: def.tags, title: "Evento", text: "", choices: [{ id: "organizar", label: "Organizar" }], data: b });
    expect(decide(state, p.id, s.pending[0], () => "organizar").ok).toBe(true);
    expect(s.queue.some((q) => q.def === "lideranca_local_contato")).toBe(true);
    const leader = String(s.flags.lider_comunitario);
    expect(state.t.persons.get(leader)?.kind).toBe("FICTIONAL_GENERATED");
    // continuações chegam mesmo sem estar "vivendo os dias"
    let contato: StoryEvent | undefined;
    for (let i = 0; i < 20 && !contato; i++) {
      runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
      contato = s.pending.find((e) => e.def === "lideranca_local_contato");
    }
    expect(contato).toBeDefined();
    expect(decide(state, p.id, contato!, () => "topar").ok).toBe(true);
    expect(s.queue.some((q) => q.def === "projeto_comunitario")).toBe(true);
  });
});

describe("filiação em etapas", () => {
  it("pedido leva semanas, passa por uma objeção e termina com resposta fundamentada", () => {
    const { state, p, st } = player("story-filiacao");
    p.stage = "ATIVISTA";
    st.activism = 18;
    p.reputation = 38;
    const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO" && x.entry_culture !== "CONVITE").sort((a, b) => (b.territory.PE ?? 0) - (a.territory.PE ?? 0))[0];
    const ctx = new Ctx(state, `action:${p.id}:0`);
    const r = performAction(ctx, p.id, "pedir_filiacao", { party: party.id });
    expect(r.ok, r.message).toBe(true);
    const req = [...state.t.affiliation_requests.values()].find((x) => x.person_id === p.id && x.kind === "PEDIDO")!;
    const wait = (Date.parse(req.decide_on) - Date.parse(state.world.game_date)) / 86_400_000;
    expect(wait).toBeGreaterThanOrEqual(12);
    expect(storyOf(st).queue.some((q) => q.def === "filiacao_analise")).toBe(true);
    let decided = false;
    for (let i = 0; i < 40 && !decided; i++) {
      runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
      const s = storyOf(st);
      const analysis = s.pending.find((e) => e.def === "filiacao_analise");
      if (analysis) decide(state, p.id, analysis, () => "conversar");
      decided = s.pending.some((e) => e.def === "filiacao_aprovada" || e.def === "filiacao_recusada") || s.log.some((e) => e.def === "filiacao_aprovada" || e.def === "filiacao_recusada");
    }
    expect(decided).toBe(true);
    if (p.party_id === party.id) {
      expect(st.party_standing).toBeLessThanOrEqual(12);
    } else {
      const again = performAction(new Ctx(state, `action:${p.id}:9`), p.id, "pedir_filiacao", { party: party.id });
      expect(again.ok).toBe(false);
      expect(again.message).toMatch(/recusou/);
    }
  });
});

describe("respostas por outra tela", () => {
  it("convite recusado no resumo some dos acontecimentos e fica no histórico", () => {
    const { state, p, st } = player("story-convite");
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO")!;
    state.t.affiliation_requests.set("inv_t", { id: "inv_t", world_id: state.world.id, person_id: p.id, party_id: party.id, kind: "CONVITE", created_on: state.world.game_date, decide_on: "2099-01-01", status: "PENDENTE", breakdown: {}, reason: null });
    scheduleStory(st, "convite_filiacao", state.world.game_date, { req: "inv_t", party: party.id, inviter: "" });
    runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
    expect(storyOf(st).pending.some((e) => e.def === "convite_filiacao")).toBe(true);
    const r = performAction(new Ctx(state, `action:${p.id}:7`), p.id, "responder_convite", { request: "inv_t", decision: "RECUSAR" });
    expect(r.ok).toBe(true);
    expect(storyOf(st).pending.some((e) => e.def === "convite_filiacao")).toBe(false);
    expect(storyOf(st).log[0].outcome).toMatch(/recusou/);
  });
});

describe("campanha", () => {
  it("apoio conquistado num grupo de eleitores mexe no voto", () => {
    const { state, p } = player("story-segmentos");
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && (x.territory.PE ?? 0) > 0.05)!;
    joinParty(new Ctx(state, "setup"), p, party);
    const race = [...state.t.races.values()][0] ?? null;
    const ctx = new Ctx(state, "setup2");
    // disputa sintética para o teste
    const fakeRace = { ...(race ?? {}), id: "race_t", geo: "PE", office_code: "GOVERNADOR", electorate: 7_000_000, seats: 1, election_id: "e2026", status: "ABERTA", results: {}, latest_poll: null } as never;
    const mk = (id: string, personId: string, partyId: string) =>
      ({ id, world_id: state.world.id, election_id: "e2026", race_id: "race_t", person_id: personId, party_id: partyId, office_code: "GOVERNADOR", geo: "PE", status: "HOMOLOGADA", is_player: personId === p.id, ballot_number: 10, campaign: { budget: 0, spent: 0, fefc: 0, donations: 0, volunteers: 0, team: {}, momentum: 0, debate_score: 0, proposals: [], rumor_damage: 0 }, votes: 0, vote_share: 0, note: null }) as never;
    const other = [...state.t.persons.values()].find((x) => x.uf === "PE" && x.kind !== "PLAYER" && x.party_id && x.party_id !== party.id)!;
    const mine = mk("c_me", p.id, party.id) as { campaign: { seg?: Record<string, number> } };
    const theirs = mk("c_ot", other.id, other.party_id!);
    const before = tallyMajoritarian(ctx, fakeRace, [mine as never, theirs]);
    mine.campaign.seg = { jovens_urbanos: 0.4, trabalhadores_formais: 0.4, informais: 0.4 };
    const after = tallyMajoritarian(ctx, fakeRace, [mine as never, theirs]);
    expect(after.votes.get("c_me")! / after.valid).toBeGreaterThan(before.votes.get("c_me")! / before.valid);
  });
});

describe("fim da jornada", () => {
  it("a mortalidade cresce com a idade", () => {
    expect(annualMortality(30)).toBeLessThan(annualMortality(60));
    expect(annualMortality(60)).toBeLessThan(annualMortality(85));
    expect(annualMortality(40)).toBeLessThan(0.002);
  });

  it("morte encerra cargos, candidaturas e filiação e gera o balanço da carreira", () => {
    const { state, p, st } = player("story-fim", { age: 70 });
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO")!;
    joinParty(new Ctx(state, "setup"), p, party);
    const ctx = new Ctx(state, "tick");
    const c = new StoryCtx(ctx, p, st, ctx.rng("t", p.id));
    endCareer(c, "MORTE", "um infarto");
    expect(p.status).toBe("RETIRED");
    expect(p.party_id).toBeNull();
    expect([...state.t.memberships.values()].filter((m) => m.person_id === p.id && m.status === "ATIVA")).toHaveLength(0);
    expect(storyOf(st).ended?.cause).toBe("MORTE");
    const sum = careerSummary(ctx, p.id)!;
    expect(sum.end.age).toBe(70);
    expect(sum.title.label.length).toBeGreaterThan(3);
    expect(sum.epitaph).toMatch(/Morreu aos 70 anos/);
    expect(sum.parties[0]?.acronym).toBe(party.acronym);
    // depois do fim, o tempo não "vive" mais este personagem
    const r = stepDays(state, p.id, { days: 3 });
    expect(r.stop).toBe("fim");
    expect(r.ticks).toBe(0);
  });

  it("aposentadoria pela ação encerra a carreira", () => {
    const { state, p, st } = player("story-aposenta");
    const r = performAction(new Ctx(state, `action:${p.id}:0`), p.id, "aposentar", {});
    expect(r.ok, r.message).toBe(true);
    expect(storyOf(st).ended?.cause).toBe("APOSENTADORIA");
    expect(p.status).toBe("RETIRED");
  });
});
