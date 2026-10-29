import {
  activeCandidacy,
  availableActions,
  canBeTargeted,
  CRIMES,
  Ctx,
  currentElection,
  fundableCandidacies,
  geoName,
  indicableMembers,
  indicationElection,
  isReal,
  OFFICES,
  officesForElection,
  partyLedBy,
  pendingIndications,
  POLICY_CATALOG,
  scaledAmount,
  SPHERE_LABEL,
  UF_BY_CODE,
  UF_CODES,
  type ActionCategory,
  type WorldState,
} from "@dp/engine";
import { fmtDate, fmtMoney } from "./format";

export interface ActionOption {
  value: string;
  label: string;
  /** cargo, partido e UF de pessoas, para os filtros da lista */
  meta?: { o: string; p: string; u: string };
}
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
  /** conduta ilícita: nome, natureza e base legal */
  crime?: { label: string; sphere: string; law: string };
  /** texto de confirmação para ações irreversíveis */
  confirm?: string;
}

/** com filtros por cargo, partido e UF, a lista pode ser longa */
const PERSON_LIMIT = 300;

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
  const option = (p: (typeof persons)[number], extra = ""): ActionOption => ({
    value: p.id,
    label: describe(p) + extra,
    meta: { o: p.office_code ? OFFICES[p.office_code].name : p.kind === "PLAYER" ? "Jogador(a)" : "Sem mandato", p: (p.party_id && state.t.parties.get(p.party_id)?.acronym) || "Sem partido", u: p.uf },
  });

  const conversable = persons
    .filter((p) => p.kind !== "PLAYER" && (p.uf === me.uf || p.tier === 1))
    .sort((a, b) => a.tier - b.tier || b.reputation - a.reputation)
    .slice(0, PERSON_LIMIT)
    .map((p) => option(p));
  // alvos: quem tem dossiê, jogadores, gente do seu estado e quem tem mandato em qualquer UF
  const targetable = persons
    .filter((p) => canBeTargeted(p) && (p.uf === me.uf || p.kind === "PLAYER" || !!p.office_code || (st.dossiers[p.id] ?? 0) > 0))
    .sort((a, b) => (st.dossiers[b.id] ?? 0) - (st.dossiers[a.id] ?? 0) || Number(b.uf === me.uf) - Number(a.uf === me.uf) || a.tier - b.tier || b.reputation - a.reputation)
    .slice(0, PERSON_LIMIT)
    .map((p) => option(p, st.dossiers[p.id] ? ` · dossiê ${Math.round(st.dossiers[p.id] * 100)}%` : ""));
  const myCand = activeCandidacy(ctx, personId);
  const rivals = myCand
    ? [...state.t.candidacies.values()]
        .filter((c) => c.race_id === myCand.race_id && c.id !== myCand.id)
        .map((c) => state.t.persons.get(c.person_id))
        .filter((p): p is NonNullable<typeof p> => !!p && canBeTargeted(p))
        .map((p) => option(p))
    : [];
  const e = currentElection(ctx);
  const year = Number(state.world.game_date.slice(0, 4));
  const myParty = partyLedBy(ctx, personId);
  const recruits = myParty
    ? persons
        .filter((p) => p.party_id !== myParty.id && !(isReal(p.kind) && p.tier <= 1) && (p.uf === me.uf || (myParty.territory[p.uf] ?? 0) >= 0.02 || p.kind === "PLAYER"))
        .sort((a, b) => Number(!!b.office_code) - Number(!!a.office_code) || b.reputation - a.reputation)
        .slice(0, PERSON_LIMIT)
        .map((p) => option(p))
    : [];

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
      case "party_request":
        return myParty
          ? [...state.t.affiliation_requests.values()]
              .filter((r) => r.party_id === myParty.id && r.kind === "PEDIDO" && r.status === "PENDENTE")
              .map((r) => {
                const who = state.t.persons.get(r.person_id);
                return who ? { ...option(who), value: r.id } : { value: r.id, label: "Pedido" };
              })
          : [];
      case "recruit":
        return recruits;
      case "scheme":
        return [...state.t.illicit_acts.values()]
          .filter((a) => a.person_id === personId && a.ongoing)
          .map((a) => ({ value: a.id, label: `${CRIMES[a.kind].label} — ${fmtMoney(a.monthly_gain)}/mês, ${fmtMoney(a.amount)} no total` }));
      case "member": {
        const e = indicationElection(ctx);
        return myParty && e ? indicableMembers(ctx, myParty, e).slice(0, PERSON_LIMIT).map((p) => option(p)) : [];
      }
      case "indication":
        return myParty
          ? pendingIndications(ctx, myParty).map((c) => ({ value: c.id, label: `${state.t.persons.get(c.person_id)?.name ?? "Membro"} — ${OFFICES[c.office_code].name} · ${geoName(c.geo, state)}` }))
          : [];
      case "party_candidacy":
        return myParty
          ? fundableCandidacies(ctx, myParty).map((c) => {
              const given = myParty.campaign_fund?.given[c.id] ?? 0;
              return { value: c.id, label: `${state.t.persons.get(c.person_id)?.name ?? "Candidatura"} — ${OFFICES[c.office_code].name} · ${geoName(c.geo, state)}${given ? ` · já recebeu ${fmtMoney(given)}` : ""}` };
            })
          : [];
      case "fund_share": {
        const left = myParty?.campaign_fund?.left ?? 0;
        return [10, 25, 50, 100].map((pct) => ({ value: String(pct), label: `${pct === 100 ? "Tudo o que resta" : `${pct}% do que resta`} (${fmtMoney(Math.round((left * pct) / 100))})` }));
      }
      case "uf":
        return UF_CODES.map((u) => ({ value: u, label: `${u} — ${UF_BY_CODE[u].name}` }));
      case "uf_br":
        return [{ value: "BR", label: "Todo o país (proporcional ao eleitorado)" }, ...UF_CODES.map((u) => ({ value: u, label: `${u} — ${UF_BY_CODE[u].name}` }))];
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
  const amountOptions = (bases: number[] | undefined): ActionOption[] | undefined =>
    bases?.map((b) => {
      const v = scaledAmount(ctx, b);
      return { value: String(v), label: fmtMoney(v) };
    });

  return availableActions(ctx, personId)
    .filter(({ def }) => !categories || categories.includes(def.category))
    .map(({ def, reason }) => ({
      id: def.id,
      label: def.label,
      description: def.description,
      category: def.category,
      energy: def.energy,
      cost: def.costFn ? def.costFn(ctx, me, st) : def.cost,
      reason,
      crime: def.crime ? { label: CRIMES[def.crime].label, sphere: SPHERE_LABEL[CRIMES[def.crime].sphere], law: CRIMES[def.crime].law(year) } : undefined,
      confirm: def.confirm,
      params: (def.params ?? []).map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        optional: p.optional,
        options: p.type === "amount" ? amountOptions(p.amounts) : optionsFor(def.id, p.type, p.options),
      })),
    }));
}
