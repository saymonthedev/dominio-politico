import { describe, expect, it } from "vitest";
import { addSignatures, createCharacter, Ctx, indicationElection, performAction, runTicks, spawnProceduralCadre } from "../src";
import { freshWorld } from "./helpers";

function advanceUntil(state: ReturnType<typeof freshWorld>["state"], done: () => boolean, limit = "2029-12-31") {
  while (!done() && state.world.game_date < limit) runTicks(state, { target: state.world.tick + 1, maxTicks: 1 });
}

describe("candidaturas do partido próprio", () => {
  it("a presidência indica a chapa, reparte o fundo eleitoral e a sobra volta ao Tesouro", () => {
    const { state } = freshWorld("chapa-propria");
    const ctx = new Ctx(state, "action:setup");
    const r = createCharacter(ctx, { userId: "00000000-0000-0000-0000-000000000099", name: "Lia Teste", uf: "BA", age: 40, profession: "advogado", origin: "classe_media", interests: [], ideology: { economy: -10 } });
    const p = r.person!;
    const st = state.t.person_states.get(p.id)!;
    st.money = 3_000_000;
    p.reputation = 45;
    const founded = performAction(ctx, p.id, "fundar_partido", { name: "Partido do Sertão Unido", acronym: "PSUN", number: "64", color: "#ad1457", entry: "ABERTO" });
    expect(founded.ok, founded.message).toBe(true);
    const party = [...state.t.parties.values()].find((x) => x.founder_id === p.id)!;
    addSignatures(party, "BR", party.formation!.goal * 1.4);
    advanceUntil(state, () => party.status === "ATIVO");
    expect(party.status).toBe("ATIVO");
    expect(party.president_id).toBe(p.id);

    // dois quadros fictícios na cidade da presidenta
    const city = p.municipality;
    const members = [0, 1].map((i) => {
      const m = spawnProceduralCadre(new Ctx(state, `action:membro:${i}`), { partyId: party.id, uf: "BA", municipality: city, ideology: party.ideology, roleLabel: `quadro ${i}`, ageRange: [35, 50], reputation: 50 });
      state.t.person_states.get(m.id)!.filiation_date = "2026-11-01";
      return m;
    });

    // ano eleitoral de 2028: indicações abertas
    advanceUntil(state, () => !!indicationElection(new Ctx(state, "view")));
    const e = indicationElection(new Ctx(state, "view"))!;
    expect(e.year).toBe(2028);
    const act = (id: string, params: Record<string, string>) => {
      st.energy = 100;
      return performAction(new Ctx(state, `action:${id}:${st.action_seq}`), p.id, id, params);
    };
    const prefeito = act("indicar_candidato", { member: members[0].id, office: "PREFEITO" });
    expect(prefeito.ok, prefeito.message).toBe(true);
    const vereador = act("indicar_candidato", { member: members[1].id, office: "VEREADOR" });
    expect(vereador.ok, vereador.message).toBe(true);
    // a mesma vaga majoritária não aceita um segundo nome do partido
    const extra = spawnProceduralCadre(new Ctx(state, "action:membro:extra"), { partyId: party.id, uf: "BA", municipality: city, ideology: party.ideology, roleLabel: "quadro extra", ageRange: [35, 50] });
    state.t.person_states.get(extra.id)!.filiation_date = "2026-11-01";
    expect(act("indicar_candidato", { member: extra.id, office: "PREFEITO" }).ok).toBe(false);

    // convenções: a chapa da presidência é homologada e o fundo chega ao partido
    advanceUntil(state, () => state.world.game_date > e.calendar.conventionEnd);
    const cands = [...state.t.candidacies.values()].filter((c) => c.party_id === party.id && c.election_id === e.id);
    expect(cands.map((c) => c.status).sort()).toEqual(["HOMOLOGADA", "HOMOLOGADA"]);
    expect(cands.every((c) => c.campaign.fefc === 0)).toBe(true);
    const fund = party.campaign_fund!;
    expect(fund.election_id).toBe(e.id);
    expect(fund.total).toBeGreaterThan(0);

    const mayorCand = cands.find((c) => c.office_code === "PREFEITO")!;
    const given = act("repassar_fundo", { candidacy: mayorCand.id, share: "50" });
    expect(given.ok, given.message).toBe(true);
    expect(mayorCand.campaign.fefc).toBeCloseTo(fund.total / 2, -3);
    expect(fund.left).toBeCloseTo(fund.total / 2, -3);

    // 1º turno: o que não foi repassado volta ao Tesouro
    advanceUntil(state, () => state.world.game_date > e.first_round);
    expect(party.campaign_fund!.left).toBe(0);
    expect(["ELEITO", "NAO_ELEITO", "SEGUNDO_TURNO", "SUPLENTE"]).toContain(mayorCand.status);
  }, 300_000);
});
