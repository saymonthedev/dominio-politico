import { describe, expect, it } from "vitest";
import {
  capitalId,
  checkEligibility,
  clanOf,
  createCharacter,
  createHeir,
  Ctx,
  endCareer,
  familyOf,
  familyStateOf,
  joinParty,
  performAction,
  relKey,
  StoryCtx,
  type PersonRow,
  type WorldState,
} from "../src";
import { freshWorld } from "./helpers";

let n = 0;
const USER = "00000000-0000-0000-0000-000000000099";

function act(state: WorldState, p: PersonRow, id: string, params: Record<string, string>) {
  state.t.person_states.get(p.id)!.energy = 100;
  return performAction(new Ctx(state, `action:${p.id}:${++n}`), p.id, id, params);
}

/** Jogador de 55 anos em Fortaleza, filiado, com esposa e filho adultos. */
function family(seed: string) {
  const { state } = freshWorld(seed);
  state.world.game_date = "2027-03-01";
  const ctx = new Ctx(state, "action:setup");
  const me = createCharacter(ctx, { userId: USER, name: "João Teste", uf: "CE", age: 55, profession: "advogado", origin: "classe_media", interests: [], ideology: {} }).person!;
  const party = [...state.t.parties.values()].filter((x) => x.status === "ATIVO").sort((a, b) => (b.territory.CE ?? 0) - (a.territory.CE ?? 0))[0];
  joinParty(ctx, me, party);
  const st = state.t.person_states.get(me.id)!;
  st.reach.CE = 0.6;
  st.money = 1_000_000;
  me.reputation = 80;
  const f = familyStateOf(st, me, state.world.game_date);
  f.gone = familyOf(ctx, me, st).filter((m) => m.role === "CONJUGE" || m.role === "FILHO").map((m) => m.id);
  f.added.push({ id: "conjuge-t", role: "CONJUGE", name: "Maria Teste", born: 1973, bond: 80, female: true, chosen: true });
  f.added.push({ id: "filho-t", role: "FILHO", name: "Pedro Teste", born: 2000, bond: 85, female: false, chosen: true });
  return { state, me, st, party, city: capitalId("CE") };
}

describe("clã político: familiar candidato", () => {
  it("o cônjuge entra no partido com parte do nome e da reputação e lança pré-candidatura", () => {
    const { state, me, st, party, city } = family("cla-lancar");
    const r = act(state, me, "lancar_familiar", { familiar: "conjuge-t", cargo: `e2028|VEREADOR|${city}` });
    expect(r.ok, r.message).toBe(true);
    const famId = st.story!.family!.politicos!["conjuge-t"];
    const fam = state.t.persons.get(famId)!;
    expect(fam).toMatchObject({ kind: "FICTIONAL_GENERATED", name: "Maria Teste", birth_year: 1973, party_id: party.id, uf: "CE", municipality: city });
    expect(fam.reputation).toBe(Math.round(20 + 0.35 * 80));
    expect(state.t.person_states.get(famId)!.reach.CE).toBeCloseTo(0.6 * 0.35, 3);
    const c = [...state.t.candidacies.values()].find((x) => x.person_id === famId)!;
    expect(c).toMatchObject({ status: "PRE", office_code: "VEREADOR", geo: city, party_id: party.id, election_id: "e2028" });
    expect(clanOf(new Ctx(state, "read"), famId)).toBe(clanOf(new Ctx(state, "read"), me.id));
    // não lança a mesma pessoa duas vezes
    expect(act(state, me, "lancar_familiar", { familiar: "conjuge-t", cargo: `e2028|VEREADOR|${city}` }).ok).toBe(false);
  });

  it("Constituição, art. 14, § 7º: parente do prefeito não disputa na cidade dele; no estado, pode; reeleição, pode", () => {
    const { state, me, st, city } = family("cla-reflexa");
    Object.assign(me, { office_code: "PREFEITO", office_geo: city });
    const blocked = act(state, me, "lancar_familiar", { familiar: "filho-t", cargo: `e2028|VEREADOR|${city}` });
    expect(blocked.ok).toBe(false);
    expect(blocked.message).toContain("art. 14");
    const ok = act(state, me, "lancar_familiar", { familiar: "filho-t", cargo: "e2030|DEP_ESTADUAL|CE" });
    expect(ok.ok, ok.message).toBe(true);
    const son = state.t.persons.get(st.story!.family!.politicos!["filho-t"])!;
    const e2028 = state.t.elections.get("e2028")!;
    // a regra também vale na convenção (elegibilidade)
    const elig = checkEligibility(new Ctx(state, "read"), son, "VEREADOR", city, e2028);
    expect(elig.reasons.join(" ")).toContain("art. 14");
    // já vereador, tenta a reeleição: pode
    Object.assign(son, { office_code: "VEREADOR", office_geo: city });
    expect(checkEligibility(new Ctx(state, "read"), son, "VEREADOR", city, e2028).reasons.join(" ")).not.toContain("art. 14");
  });
});

describe("clã político: herdeiro", () => {
  it("depois da morte, o filho continua a carreira com parte do nome, o partido, a herança e os aliados", () => {
    const { state, me, st, party } = family("cla-herdeiro");
    const ally = [...state.t.persons.values()].find((x) => x.kind === "FICTIONAL_GENERATED" && x.status === "ACTIVE")!;
    state.t.relationships.set(relKey(me.id, ally.id), { id: relKey(me.id, ally.id), world_id: state.world.id, a_id: me.id, b_id: ally.id, score: 80, interactions: 3, last_on: state.world.game_date });
    endCareer(new StoryCtx(new Ctx(state, "tick"), me, st, new Ctx(state, "tick").rng("t")), "MORTE", "um infarto");
    expect(me.status).toBe("RETIRED");
    const r = createHeir(new Ctx(state, "action:heir"), { userId: USER, titularId: me.id, memberId: "filho-t" });
    expect(r.ok, r.error).toBe(true);
    const heir = r.person!;
    const hst = state.t.person_states.get(heir.id)!;
    expect(heir).toMatchObject({ kind: "PLAYER", user_id: USER, name: "Pedro Teste", birth_year: 2000, uf: "CE", party_id: party.id, status: "ACTIVE" });
    expect(hst.reach.CE).toBeCloseTo(0.6 * 0.35, 3);
    expect(hst.money).toBeGreaterThanOrEqual(Math.round(1_000_000 * 0.96));
    expect(state.t.relationships.get(relKey(heir.id, ally.id))?.score).toBe(40);
    expect(hst.story?.cla).toMatchObject({ de: me.id, nome_de: "João Teste" });
    // a família do herdeiro é a do titular: o pai (falecido) e a mãe
    const fam = familyOf(new Ctx(state, "read"), heir, hst);
    expect(fam.find((m) => m.role === "MAE")?.name).toBe("Maria Teste");
    expect(fam.some((m) => m.name === "João Teste")).toBe(false);
    expect(st.story?.ended?.heir).toBe(heir.id);
    // um personagem por mundo
    expect(createHeir(new Ctx(state, "action:heir2"), { userId: USER, titularId: me.id, memberId: "conjuge-t" }).ok).toBe(false);
  });

  it("passar o bastão em vida: o familiar que já é vereador vira o personagem, com o mandato", () => {
    const { state, me, city } = family("cla-bastao");
    expect(act(state, me, "lancar_familiar", { familiar: "conjuge-t", cargo: `e2028|VEREADOR|${city}` }).ok).toBe(true);
    const wifeId = state.t.person_states.get(me.id)!.story!.family!.politicos!["conjuge-t"];
    const wife = state.t.persons.get(wifeId)!;
    Object.assign(wife, { office_code: "VEREADOR", office_geo: city, stage: "MANDATO" });
    state.t.mandates.set("man_vereadora", { id: "man_vereadora", world_id: state.world.id, person_id: wifeId, office_code: "VEREADOR", geo: city, start_on: "2025-01-01", end_on: "2029-01-01", status: "ATIVO", election_id: null, approval: 50 });
    const r = act(state, me, "passar_bastao", { herdeiro: "conjuge-t" });
    expect(r.ok, r.message).toBe(true);
    expect(me.status).toBe("RETIRED");
    expect(wife).toMatchObject({ kind: "PLAYER", user_id: USER, office_code: "VEREADOR", status: "ACTIVE" });
    expect(state.t.mandates.get("man_vereadora")!.status).toBe("ATIVO");
    const live = [...state.t.candidacies.values()].find((c) => c.person_id === wifeId && c.status === "PRE")!;
    expect(live.is_player).toBe(true);
    // a família da herdeira: o marido (que se aposentou, segue vivo) e o filho
    const fam = familyOf(new Ctx(state, "read"), wife, state.t.person_states.get(wifeId)!);
    expect(fam.find((m) => m.role === "CONJUGE")?.name).toBe("João Teste");
    expect(fam.find((m) => m.role === "FILHO")?.name).toBe("Pedro Teste");
  });
});
