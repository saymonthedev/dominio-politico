import { describe, expect, it } from "vitest";
import { conselhoVoteDate, createCharacter, Ctx, dailyBetween, leaveForCandidacy, monthlyStatement, nextConselhoYear, performAction } from "../src";
import { freshWorld } from "./helpers";

type World = ReturnType<typeof freshWorld>["state"];

const novo = (state: World, userId: string, uf = "PE") => {
  const r = createCharacter(new Ctx(state, `action:novo-${userId}`), { userId, name: "Conselheira Teste", uf, age: 34, profession: "professor", origin: "classe_media", interests: [], ideology: {} });
  expect(r.ok, r.ok ? "" : r.error).toBe(true);
  return { me: r.person!, st: state.t.person_states.get(r.person!.id)! };
};

describe("atividades entre eleições", () => {
  it("datas da eleição unificada do Conselho Tutelar (1º domingo de outubro)", () => {
    expect(conselhoVoteDate(2019)).toBe("2019-10-06");
    expect(conselhoVoteDate(2023)).toBe("2023-10-01");
    expect(conselhoVoteDate(2027)).toBe("2027-10-03");
    expect(nextConselhoYear(2024)).toBe(2027);
    expect(nextConselhoYear(2027)).toBe(2027);
  });

  it("Conselho Tutelar: inscrição, campanha na comunidade, votação e remuneração", () => {
    const { state } = freshWorld("conselho");
    const { me, st } = novo(state, "00000000-0000-4000-8000-0000000000c1");
    // fora do período: a ação diz quando abre
    const fora = performAction(new Ctx(state, "action:c0"), me.id, "candidatar_conselho", {});
    expect(fora.ok).toBe(false);
    expect(fora.message).toContain("Inscrições de abril a julho de 2027");

    state.world.game_date = "2027-05-10";
    st.energy = 100;
    const r = performAction(new Ctx(state, "action:c1"), me.id, "candidatar_conselho", {});
    expect(r.ok, r.message).toBe(true);
    expect(st.story?.conselho).toMatchObject({ year: 2027, status: "CANDIDATO", actions: 0 });

    // cada ação na comunidade conta para a votação
    for (let i = 0; i < 4; i++) {
      st.energy = 100;
      const a = performAction(new Ctx(state, `action:c2-${i}`), me.id, "evento_local", {});
      expect(a.ok, a.message).toBe(true);
    }
    expect(st.story?.conselho?.actions).toBe(4);

    // dia da votação: resultado, votos e aviso ao jogador
    state.world.game_date = "2027-10-03";
    const tctx = new Ctx(state, "tick:conselho");
    dailyBetween(tctx);
    const c = st.story!.conselho!;
    expect(["ELEITO", "NAO_ELEITO"]).toContain(c.status);
    expect(c.votes).toBeGreaterThan(0);
    expect(tctx.changes.get("notifications").some((n) => n.person_id === me.id && /Conselho Tutelar/.test(n.title))).toBe(true);

    // em exercício: a remuneração entra no mês e a profissão fica em licença
    st.story!.conselho = { ...c, status: "ELEITO", from: "2028-01-10", until: "2032-01-09" };
    const mes = monthlyStatement(new Ctx(state, "tick:mes"), me, st, "2028-03-01");
    expect(mes.items.some((x) => x.label === "Remuneração de conselheiro(a) tutelar" && x.amount > 0)).toBe(true);
    expect(mes.items.some((x) => x.label.startsWith("Salário de professor") && x.amount > 0)).toBe(false);
    // e o mandato termina sozinho depois de 4 anos
    state.world.game_date = "2032-01-10";
    dailyBetween(new Ctx(state, "tick:fim"));
    expect(st.story!.conselho!.status).toBe("ENCERRADO");
  });

  it("cargo de confiança na bancada do partido: salário, saída na pré-candidatura e ao trocar de partido", () => {
    const { state } = freshWorld("confianca");
    // um partido com deputados estaduais em exercício em PE
    const dep = [...state.t.mandates.values()].find((m) => (m.status === "ATIVO" || m.status === "FUTURO") && m.office_code === "DEP_ESTADUAL" && m.geo === "PE" && state.t.persons.get(m.person_id)?.party_id);
    expect(dep).toBeTruthy();
    const party = state.t.parties.get(state.t.persons.get(dep!.person_id)!.party_id!)!;
    const { me, st } = novo(state, "00000000-0000-4000-8000-0000000000c2");
    me.party_id = party.id;
    me.stage = "FILIADO";
    st.party_standing = 100;
    st.political_capital = 100;
    st.energy = 100;
    let r = performAction(new Ctx(state, "action:k1"), me.id, "pedir_cargo_confianca", { where: "ASSEMBLEIA" });
    for (let i = 2; !st.story?.confianca && i < 8; i++) {
      // sem vaga desta vez: tenta de novo depois de 30 dias
      expect(r.ok, r.message).toBe(true);
      state.world.game_date = new Date(Date.parse(`${state.world.game_date}T12:00:00Z`) + 31 * 86_400_000).toISOString().slice(0, 10);
      st.energy = 100;
      r = performAction(new Ctx(state, `action:k${i}`), me.id, "pedir_cargo_confianca", { where: "ASSEMBLEIA" });
    }
    expect(st.story?.confianca?.label).toContain(`bancada do ${party.acronym}`);
    const mes = monthlyStatement(new Ctx(state, "tick:mes"), me, st, state.world.game_date);
    expect(mes.items.some((x) => x.label.startsWith("Salário de assessor(a)") && x.amount > 0)).toBe(true);

    // pré-candidatura: deixa o cargo (desincompatibilização)
    const note = leaveForCandidacy(new Ctx(state, "action:k-pre"), me, st);
    expect(note).toContain("desincompatibilização");
    expect(st.story?.confianca).toBeNull();

    // de volta ao cargo e troca de partido: o cargo acaba
    st.story!.confianca = { where: "ASSEMBLEIA", party: party.id, label: `assessor(a) da bancada do ${party.acronym}`, since: state.world.game_date };
    me.party_id = null;
    dailyBetween(new Ctx(state, "tick:troca"));
    expect(st.story?.confianca).toBeNull();
  });
});
