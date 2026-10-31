import { describe, expect, it } from "vitest";
import {
  activeProposals,
  bumpApproval,
  createCharacter,
  Ctx,
  energyRecovery,
  ensureApproval,
  injure,
  injuryBlocks,
  joinParty,
  monthlyApproval,
  monthlyStatement,
  netWorth,
  partyPostOf,
  performAction,
  quote,
  resolveStory,
  setPartyPost,
  stepDays,
  STORY_DEFS,
  StoryCtx,
  storyOf,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

function player(seed: string, opts: { age?: number; profession?: string; origin?: string; uf?: string; city?: string } = {}) {
  const { state } = freshWorld(seed);
  const ctx = new Ctx(state, "action:setup");
  const r = createCharacter(ctx, {
    userId: "00000000-0000-0000-0000-000000000099",
    name: "Rita Teste",
    uf: opts.uf ?? "SC",
    city: opts.city,
    age: opts.age ?? 30,
    profession: opts.profession ?? "professor",
    origin: opts.origin ?? "classe_media",
    interests: [],
    ideology: { economy: -10 },
  });
  expect(r.ok, r.error).toBe(true);
  const p = r.person!;
  return { state, p, st: state.t.person_states.get(p.id)! };
}

const act = (state: WorldState, id: string, action: string, params: Record<string, string> = {}) => {
  const st = state.t.person_states.get(id)!;
  st.energy = 100;
  return performAction(new Ctx(state, `action:${id}:${st.action_seq}`), id, action, params);
};

describe("moradia e bens", () => {
  it("a moradia inicial acompanha idade, renda e origem", () => {
    const jovem = player("casa-jovem", { age: 18, profession: "estudante" });
    expect(storyOf(jovem.st).home?.kind).toBe("FAMILIA");
    expect(storyOf(jovem.st).car ?? null).toBeNull();

    const prof = player("casa-prof", { age: 30 });
    const home = storyOf(prof.st).home!;
    expect(["PROPRIA", "ALUGUEL"]).toContain(home.kind);
    expect(home.tier).toBeLessThanOrEqual(2);
    if (home.kind === "PROPRIA") expect(home.loan?.balance ?? 0).toBeGreaterThan(0);

    const rica = player("casa-elite", { age: 45, profession: "medico", origin: "elite" });
    const h2 = storyOf(rica.st).home!;
    expect(h2.kind).toBe("PROPRIA");
    expect(h2.tier).toBeGreaterThanOrEqual(3);
    expect(h2.loan).toBeNull();
    expect(storyOf(rica.st).car?.model).toBe("luxo");
    // bens declarados batem com casa + carro + outros
    expect(rica.st.assets).toBeGreaterThan(h2.value);
  });

  it("alugar, comprar financiado e vender mexem no caixa, nos bens e nas dívidas", () => {
    const { state, p, st } = player("casa-negocio", { age: 26, profession: "engenheiro" });
    st.money = 400_000;
    const before = netWorth(st);
    const ctx = new Ctx(state, "view");
    const city = storyOf(st).home!.city;
    const bairro = storyOf(st).home!.bairro;
    if (storyOf(st).home!.kind === "PROPRIA") {
      expect(act(state, p.id, "vender_imovel", { depois: "ALUGAR" }).ok).toBe(true);
    }
    const r1 = act(state, p.id, "alugar_imovel", { bairro, padrao: "1" });
    expect(r1.ok, r1.message).toBe(true);
    expect(storyOf(st).home!.kind).toBe("ALUGUEL");
    const q = quote(ctx.s, city, bairro, 2);
    const beforeBuy = netWorth(st);
    const r2 = act(state, p.id, "comprar_imovel", { bairro, padrao: "2", pagamento: "FINANCIADO" });
    expect(r2.ok, r2.message).toBe(true);
    expect(storyOf(st).home!.kind).toBe("PROPRIA");
    expect(storyOf(st).home!.loan!.balance).toBe(Math.round(q.price * 0.8));
    // patrimônio líquido cai só pelas taxas (ITBI, cartório) e pela mudança, não pelo preço do imóvel
    expect(Math.abs(netWorth(st) - beforeBuy)).toBeLessThan(q.price * 0.05);
    expect(before).toBeGreaterThan(0);
    const r3 = act(state, p.id, "comprar_carro", { modelo: "popular_novo", pagamento: "VISTA" });
    expect(r3.ok, r3.message).toBe(true);
    const m = monthlyStatement(new Ctx(state, "view"), p, st);
    expect(m.items.some((i) => i.kind === "MORADIA" && i.label.includes("Prestação"))).toBe(true);
    expect(m.items.some((i) => i.kind === "VEICULO")).toBe(true);
    const r4 = act(state, p.id, "vender_imovel", { depois: "FAMILIA" });
    expect(r4.ok, r4.message).toBe(true);
    expect(storyOf(st).home!.kind).toBe("FAMILIA");
    expect(storyOf(st).home!.loan).toBeNull();
  });

  it("no mandato a profissão fica em licença: entra só o subsídio", () => {
    const { state, p, st } = player("salario-mandato");
    p.office_code = "VEREADOR";
    p.office_geo = storyOf(st).home!.city;
    const m = monthlyStatement(new Ctx(state, "view"), p, st);
    const renda = m.items.filter((i) => i.kind === "RENDA");
    expect(renda.every((i) => i.amount === 0)).toBe(true);
    expect(m.items.some((i) => i.kind === "SUBSIDIO" && i.amount > 0)).toBe(true);
    expect(act(state, p.id, "trabalhar").ok).toBe(false);
  });
});

describe("cansaço e lesões", () => {
  it("ações cansam, descanso alivia e lesão trava esporte e devolve menos energia", () => {
    const { state, p, st } = player("cansaco");
    const s = storyOf(st);
    s.fatigue = 30;
    expect(act(state, p.id, "evento_local").ok).toBe(true);
    expect(s.fatigue!).toBeGreaterThan(30);
    const tired = s.fatigue!;
    expect(act(state, p.id, "dia_familia").ok).toBe(true);
    expect(s.fatigue!).toBeLessThan(tired);
    const normal = energyRecovery(st, state.world.game_date);
    injure(st, "perna", state.world.game_date, new Ctx(state, "t").rng("x", p.id));
    expect(injuryBlocks(st, state.world.game_date, "jogar_bola")).toMatch(/esporte/);
    expect(injuryBlocks(st, state.world.game_date, "evento_local")).toMatch(/bater perna/);
    expect(energyRecovery(st, state.world.game_date)).toBeLessThan(normal);
  });
});

describe("mandato", () => {
  it("aprovação começa na posse, anota o motivo de cada mudança e volta ao chão da reputação", () => {
    const { state, p, st } = player("aprovacao");
    p.office_code = "VEREADOR";
    p.office_geo = storyOf(st).home!.city;
    ensureApproval(p, st, state.world.game_date);
    const start = storyOf(st).approval!;
    expect(start).toBeGreaterThan(30);
    bumpApproval(p, st, state.world.game_date, 10, "teste");
    expect(storyOf(st).approval).toBeCloseTo(start + 10, 1);
    expect(storyOf(st).approval_log![0].cause).toBe("teste");
    monthlyApproval(new Ctx(state, "tick"));
    expect(storyOf(st).approval!).toBeLessThan(start + 10);
  });

  it("propostas chegam ao gabinete e andam por etapas até virar lei (ou cair)", () => {
    const { state, p, st } = player("gabinete");
    p.office_code = "VEREADOR";
    p.office_geo = storyOf(st).home!.city;
    const ctx = new Ctx(state, "tick");
    const c = new StoryCtx(ctx, p, st, ctx.rng("gab", p.id));
    const def = STORY_DEFS.gab_chegou;
    let b = def.when(c);
    // procura um pedido do tipo projeto de lei (o que tem mais etapas)
    for (let i = 0; i < 40 && b && !String(b.tpl).match(/castracao|feira|fogos|passe|horta|cameras|titulo|app/); i++) b = def.when(new StoryCtx(ctx, p, st, ctx.rng(`gab${i}`, p.id)));
    expect(b).toBeTruthy();
    storyOf(st).pending.push({ id: "sty_gab", def: def.id, on: state.world.game_date, expires: "2099-01-01", kind: "DECISAO", blocking: true, tags: def.tags, title: "t", text: "", choices: def.render(c, b!).choices.map((x) => ({ id: x.id, label: x.label })), data: b! });
    const r = resolveStory(new Ctx(state, `action:${p.id}:1`), p.id, "sty_gab", "assinar");
    expect(r.ok, r.message).toBe(true);
    expect(activeProposals(st)).toHaveLength(1);
    const prop = activeProposals(st)[0];
    // vive os dias respondendo cada etapa até a proposta terminar
    let guard = 0;
    while (activeProposals(st).length && guard++ < 40) {
      stepDays(state, p.id, { days: 30 });
      for (const ev of [...storyOf(st).pending]) {
        const pick = ev.choices.find((x) => !x.locked)?.id ?? "ok";
        resolveStory(new Ctx(state, `action:${p.id}:${st.action_seq}`), p.id, ev.id, pick);
      }
    }
    expect(prop.stage).toBe("FIM");
    expect(prop.result).toBeTruthy();
    expect(prop.log.length).toBeGreaterThan(1);
  }, 120_000);
});

describe("comando do partido", () => {
  it("quem preside o diretório nomeia, afasta e abre processo — só contra personagens do jogo", () => {
    const { state, p, st } = player("comando");
    const ctx = new Ctx(state, "setup");
    const party = [...state.t.parties.values()].find((x) => x.status === "ATIVO" && x.acronym === "PT")!;
    joinParty(ctx, p, party);
    setPartyPost(ctx, p, st, "PRES_MUNICIPAL");
    expect(partyPostOf(state, p, st)?.level).toBe("PRES_MUNICIPAL");
    // um filiado fictício na cidade
    const npc = [...state.t.persons.values()].find((x) => x.kind === "FICTIONAL_GENERATED" && x.party_id === party.id && x.uf === p.uf);
    if (npc) {
      npc.municipality = p.municipality;
      const m = [...state.t.memberships.values()].find((x) => x.person_id === npc.id && x.status === "ATIVA");
      if (m) m.role = "MEMBRO";
      const r = act(state, p.id, "nomear_dirigente", { pessoa: npc.id });
      expect(r.ok, r.message).toBe(true);
      const r2 = act(state, p.id, "processo_expulsao", { pessoa: npc.id });
      expect(r2.ok, r2.message).toBe(true);
      expect(storyOf(st).queue.some((q) => q.def === "conselho_etica")).toBe(true);
    }
    const real = [...state.t.persons.values()].find((x) => x.kind === "REAL_ACTIVE_AT_SNAPSHOT" && x.party_id === party.id);
    if (real) expect(act(state, p.id, "processo_expulsao", { pessoa: real.id }).ok).toBe(false);
  });
});

describe("catálogo", () => {
  it("acontecimentos novos não reaproveitam ids dos antigos (um sobrescreveria o outro)", async () => {
    const { NEW_CATALOGS, OLD_CATALOG_IDS } = await import("../src/story/catalog");
    const old = new Set(OLD_CATALOG_IDS);
    const ids = NEW_CATALOGS.flat().map((d) => d.id);
    expect(ids.filter((id) => old.has(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("repetição", () => {
  it("a cobrança do chefe acontece uma vez; depois vem o ultimato, não a mesma conversa", () => {
    expect(STORY_DEFS.chefe_reclama.chained).toBe(true);
    expect(STORY_DEFS.chefe_cobra.family).toBe("patrao");
    expect(STORY_DEFS.chefe_ultimato.family).toBe("patrao");
    const { state, p, st } = player("patrao");
    p.party_id = [...state.t.parties.values()][0].id;
    const ctx = new Ctx(state, "tick");
    const c = new StoryCtx(ctx, p, st, ctx.rng("chefe", p.id));
    expect(STORY_DEFS.chefe_cobra.when(c)).toBeTruthy();
    storyOf(st).flags.chefe_avisou = state.world.game_date;
    expect(STORY_DEFS.chefe_cobra.when(c)).toBeNull();
  });
});
