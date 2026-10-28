import type { WorldState } from "./state";

/**
 * Linhas gravadas antes de um campo existir chegam do banco com null.
 * Preenche os padrões para o motor e as telas trabalharem sempre com o mesmo formato
 * (e para a gravação mandar todas as colunas em todas as linhas).
 */
export function hydrateState(s: WorldState): WorldState {
  for (const st of s.t.person_states.values()) {
    st.dossiers ??= {};
    st.findings ??= {};
    st.dirty_money ??= 0;
    st.debt ??= 0;
    st.assets ??= 0;
    st.ledger ??= { month: null, items: [], net: 0 };
    st.jailed_until ??= null;
    st.sentence ??= null;
  }
  for (const a of s.t.illicit_acts.values()) {
    a.ongoing ??= false;
    a.monthly_gain ??= 0;
    a.stopped_on ??= null;
    a.office_code ??= null;
    a.geo ??= null;
    a.votes_gain ??= 0;
  }
  for (const i of s.t.investigations.values()) {
    i.party_id ??= null;
    i.target_type ??= "PESSOA";
    i.crimes ??= [];
    i.channel ??= null;
    i.measures ??= [];
    i.sentence ??= null;
  }
  for (const p of s.t.parties.values()) {
    p.founder_id ??= null;
    p.founded_on ??= null;
    p.formation ??= null;
    p.fund_suspended_until ??= null;
  }
  return s;
}
