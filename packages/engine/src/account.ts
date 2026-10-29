import type { Ctx } from "./state";

/**
 * Exclusão de conta: limpa o que é do jogador antes de o banco anonimizar o
 * personagem. Dossiês, achados, ofertas e dinheiro não declarado somem; a
 * fundação de partido em andamento é encerrada; a presidência de um partido
 * fundado passa ao membro fictício de maior prestígio; pedidos pendentes são retirados.
 */
export function clearPlayerData(ctx: Ctx, personId: string): void {
  const p = ctx.person(personId);
  const st = ctx.pstate(personId);
  if (!p || !st || p.kind !== "PLAYER") return;
  for (const party of ctx.t.parties.values()) {
    if (party.founder_id === p.id && party.status === "EM_FORMACAO") {
      party.status = "EXTINTO";
      party.president_id = null;
      ctx.save("parties", party);
    } else if (party.president_id === p.id) {
      const heir = [...ctx.t.persons.values()]
        .filter((x) => x.party_id === party.id && x.id !== p.id && x.status === "ACTIVE" && (x.kind === "FICTIONAL_GENERATED" || x.kind === "PLAYER"))
        .sort((a, b) => (ctx.pstate(b.id)?.party_standing ?? 0) - (ctx.pstate(a.id)?.party_standing ?? 0) || b.reputation - a.reputation)[0];
      party.president_id = heir?.id ?? null;
      ctx.save("parties", party);
    }
  }
  for (const r of ctx.t.affiliation_requests.values()) {
    if (r.person_id === p.id && r.status === "PENDENTE") {
      r.status = "RETIRADO";
      ctx.save("affiliation_requests", r);
    }
  }
  st.dossiers = {};
  st.findings = {};
  st.offers = [];
  st.dirty_money = 0;
  st.ledger = { month: null, items: [], net: 0 };
  ctx.save("person_states", st);
}
