import {
  activeCandidacy,
  availableActions,
  canBeTargeted,
  Ctx,
  currentElection,
  OFFICES,
  officesForElection,
  POLICY_CATALOG,
  type ActionCategory,
  type WorldState,
} from "@dp/engine";
import { fmtDate, fmtMoney } from "./format";

export interface ActionOption { value: string; label: string }
export interface ActionParamView { name: string; label: string; type: string; optional?: boolean; options?: ActionOption[] }
export interface ActionView {
  id: string;
  label: string;
  description: string;
  category: ActionCategory;
  energy: number;
  cost?: number;
  params: ActionParamView[];
  reason: string | null;
}

const PERSON_LIMIT = 150;

/** Monta as ações disponíveis do personagem, com as opções já resolvidas pelo servidor. */
export function actionsFor(state: WorldState, personId: string, categories?: ActionCategory[]): ActionView[] {
  const ctx = new Ctx(state, "view");
  const me = state.t.persons.get(personId);
  const st = state.t.person_states.get(personId);
  if (!me || !st) return [];
  const persons = [...state.t.persons.values()].filter((p) => p.status === "ACTIVE" && p.id !== personId);
  const partyLabel = (id: string | null) => (id ? state.t.parties.get(id)?.acronym ?? "" : "sem partido");
  const describe = (p: (typeof persons)[number]) =>
    `${p.name} — ${p.role_label ?? (p.office_code ? OFFICES[p.office_code].name : p.kind === "PLAYER" ? "jogador(a)" : "político(a)")} · ${partyLabel(p.party_id)} · ${p.uf}`;

  const conversable = persons
    .filter((p) => p.kind !== "PLAYER" && (p.uf === me.uf || p.tier === 1))
    .sort((a, b) => a.tier - b.tier || b.reputation - a.reputation)
    .slice(0, PERSON_LIMIT)
    .map((p) => ({ value: p.id, label: describe(p) }));
  const targetable = persons
    .filter((p) => canBeTargeted(p) && (p.uf === me.uf || p.kind === "PLAYER" || (st.dossiers[p.id] ?? 0) > 0))
    .sort((a, b) => (st.dossiers[b.id] ?? 0) - (st.dossiers[a.id] ?? 0) || a.tier - b.tier)
    .slice(0, PERSON_LIMIT)
    .map((p) => ({ value: p.id, label: `${describe(p)}${st.dossiers[p.id] ? ` · dossiê ${Math.round(st.dossiers[p.id] * 100)}%` : ""}` }));
  const myCand = activeCandidacy(ctx, personId);
  const rivals = myCand
    ? [...state.t.candidacies.values()]
        .filter((c) => c.race_id === myCand.race_id && c.id !== myCand.id)
        .map((c) => state.t.persons.get(c.person_id))
        .filter((p): p is NonNullable<typeof p> => !!p && canBeTargeted(p))
        .map((p) => ({ value: p.id, label: describe(p) }))
    : [];
  const e = currentElection(ctx);

  const optionsFor = (actionId: string, type: string, def?: ActionOption[]): ActionOption[] | undefined => {
    switch (type) {
      case "party":
        return [...state.t.parties.values()]
          .filter((p) => p.status === "ATIVO")
          .sort((a, b) => a.acronym.localeCompare(b.acronym))
          .map((p) => ({ value: p.id, label: `${p.acronym} — ${p.name}` }));
      case "person":
        if (actionId === "conversar") return conversable;
        if (actionId === "impulsionar_boato") return rivals;
        return targetable;
      case "faction":
        return [...state.t.factions.values()].filter((f) => f.party_id === me.party_id).map((f) => ({ value: f.id, label: f.name }));
      case "office":
        return e ? officesForElection(e.kind).map((o) => ({ value: o, label: `${OFFICES[o].name} (mín. ${OFFICES[o].minAge} anos)` })) : [];
      case "bill":
        return [...state.t.bills.values()].filter((b) => b.status === "TRAMITANDO").map((b) => ({ value: b.id, label: `${b.title} — votação ${fmtDate(b.vote_on)}` }));
      case "offer":
        return st.offers.map((o) => ({ value: o.id, label: `${o.kind === "PROPINA" ? "Propina" : "Caixa dois"} de ${fmtMoney(o.amount)} — ${state.t.persons.get(o.from)?.name ?? "intermediário"}` }));
      case "request":
        return [...state.t.affiliation_requests.values()]
          .filter((r) => r.person_id === personId && r.kind === "CONVITE" && r.status === "PENDENTE")
          .map((r) => ({ value: r.id, label: `Convite do ${state.t.parties.get(r.party_id)?.acronym}` }));
      case "debate":
        return myCand
          ? [...state.t.debates.values()].filter((d) => d.status === "AGENDADO" && d.participants.includes(myCand.id)).map((d) => ({ value: d.id, label: `${d.outlet} — ${fmtDate(d.scheduled_on)}` }))
          : [];
      case "policy":
        return POLICY_CATALOG.filter((p) => !me.office_code || p.offices.includes(me.office_code)).map((p) => ({ value: p.kind, label: p.title }));
      default:
        return def;
    }
  };

  return availableActions(ctx, personId)
    .filter(({ def }) => !categories || categories.includes(def.category))
    .map(({ def, reason }) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      energy: def.energy,
      cost: def.cost,
      reason,
      params: (def.params ?? []).map((p) => ({ name: p.name, label: p.label, type: p.type, optional: p.optional, options: optionsFor(def.id, p.type, p.options) })),
    }));
}
