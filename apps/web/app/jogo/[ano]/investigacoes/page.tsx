import {
  AUTHORITY_LABEL,
  CHANNEL_LABEL,
  chargeLabel,
  chargeLaw,
  convictionChance,
  CRIMES,
  dossierLabel,
  operationName,
  STAGE_LABEL,
  type DetectionChannel,
  type Finding,
  type IllicitKind,
  type InvestigationRow,
  type PartyRow,
  type PersonRow,
} from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { cachedState } from "@/lib/sim";

const STAGES: InvestigationRow["stage"][] = ["DENUNCIA", "IMPRENSA", "INVESTIGACAO", "PROCESSO", "DESFECHO"];
const OUTCOME: Record<string, { label: string; tone: "bad" | "ok" | "neutral" }> = {
  CONDENADO: { label: "condenação", tone: "bad" },
  ABSOLVIDO: { label: "absolvição", tone: "ok" },
  ARQUIVADO: { label: "arquivado", tone: "neutral" },
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

function channelText(c: InvestigationRow["channel"]): string {
  if (!c) return "origem não registrada";
  if (c === "DENUNCIA") return "denúncia de um jogador";
  if (c === "CPI") return "CPI";
  return CHANNEL_LABEL[c as DetectionChannel];
}

function CaseCard({ inv, year, people, pm, mine }: { inv: InvestigationRow; year: number; people: Map<string, PersonRow>; pm: Record<string, PartyRow>; mine?: boolean }) {
  const target = inv.person_id ? people.get(inv.person_id) : undefined;
  const party = inv.party_id ? pm[inv.party_id] : undefined;
  const stageIdx = STAGES.indexOf(inv.stage);
  const timeline = [...inv.evidences.map((e) => ({ on: e.on, text: e.description, kind: "prova" as const })), ...inv.measures.map((m) => ({ on: m.on, text: m.text, kind: "medida" as const }))]
    .sort((a, b) => b.on.localeCompare(a.on))
    .slice(0, 7);
  const lawYear = Number(inv.opened_on.slice(0, 4));
  return (
    <article className={`case2${mine ? " is-mine" : ""}`}>
      <div className="case2__head">
        {target ? (
          <a className="rel__who" href={`/jogo/${year}/pessoa/${target.id}`}>
            <PersonAvatar name={target.name} color={party?.color} photo={photoOf(target)} size={40} />
            <div>
              <b>{target.name}</b>
              <span>
                {target.role_label ?? "política"} · {target.uf}
              </span>
            </div>
          </a>
        ) : (
          <div className="rel__who">
            <span className="case2__party" style={{ background: party?.color ?? "var(--apagado)" }}>
              {party?.acronym ?? "?"}
            </span>
            <div>
              <b>Contas do {party?.acronym ?? "partido"}</b>
              <span>investigação sobre o partido</span>
            </div>
          </div>
        )}
        <div className="case2__tags">
          {inv.outcome ? <Pill tone={OUTCOME[inv.outcome].tone}>{OUTCOME[inv.outcome].label}</Pill> : <Pill tone="warn">{STAGE_LABEL[inv.stage]}</Pill>}
          {party && target && <PartyChip party={party} />}
        </div>
      </div>
      <p className="case2__meta">
        {AUTHORITY_LABEL[inv.authority].replace(/^./, (c) => c.toUpperCase())}
        {inv.stage === "INVESTIGACAO" || inv.stage === "PROCESSO" || inv.stage === "DESFECHO" ? ` · Operação ${operationName(inv)}` : ""} · começou por {channelText(inv.channel)} em {fmtDate(inv.opened_on)}
      </p>
      <div className="case2__charges">
        {inv.crimes.length ? (
          inv.crimes.map((c) => (
            <span key={c} className="charge" title={chargeLaw(c, lawYear)}>
              <b>{chargeLabel(c, lawYear)}</b>
              <small>{chargeLaw(c, lawYear)}</small>
            </span>
          ))
        ) : (
          <span className="charge charge--empty">
            <b>Sem conduta comprovada</b>
            <small>a denúncia não trouxe documentos</small>
          </span>
        )}
      </div>
      <ol className="case2__stages" aria-label="Etapas">
        {STAGES.map((s, i) => (
          <li key={s} className={i < stageIdx ? "done" : i === stageIdx ? "now" : ""}>
            <i />
            <span>{STAGE_LABEL[s]}</span>
          </li>
        ))}
      </ol>
      {!inv.outcome && (
        <div className="case2__meters">
          <MeterRow label="Provas" value={inv.evidence * 100} tone="bad" />
          <MeterRow label="Defesa" value={inv.defense * 100} tone="ok" />
          <p className="muted small">
            Chance estimada de condenação: <b>{pct(convictionChance(inv))}</b> · próxima etapa por volta de {fmtDate(inv.next_step_on)}
          </p>
        </div>
      )}
      {inv.sentence && (
        <div className="case2__sentence">
          <Icon name="scale" size={16} />
          <span>
            {inv.sentence.years > 0 ? `${inv.sentence.years} ano(s) de pena, regime ${inv.sentence.regime.toLowerCase().replace("_", " ")}` : "Sem pena de prisão"}
            {inv.sentence.fine ? ` · multa/devolução de ${fmtMoney(inv.sentence.fine)}` : ""}
            {inv.sentence.cassation ? " · cassação" : ""}
            {inv.sentence.ineligible_until ? ` · inelegível até ${fmtDate(inv.sentence.ineligible_until)}` : ""}
          </span>
        </div>
      )}
      {timeline.length > 0 && (
        <ol className="case2__tl">
          {timeline.map((t, i) => (
            <li key={i} className={t.kind}>
              <span className="mono">{fmtDate(t.on)}</span>
              <span>{t.text}</span>
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const kind = f.act_id ? "ok" : f.verified ? "none" : "rumor";
  return (
    <li className={`finding finding--${kind}`}>
      <Icon name={kind === "ok" ? "check" : kind === "none" ? "shield" : "info"} size={14} />
      <span>
        {f.text}
        <small>
          {fmtDate(f.on)} · {kind === "ok" ? `prova ${f.strength >= 0.35 ? "forte" : f.strength >= 0.2 ? "moderada" : "fraca"}${f.crime ? ` de ${CRIMES[f.crime].label.toLowerCase()}` : ""}` : kind === "none" ? "nada encontrado" : "pista sem prova"}
        </small>
      </span>
    </li>
  );
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, invQ] = await Promise.all([
    cachedState(me.worldId),
    getParties(me.worldId),
    sb.from("investigations").select("*").eq("world_id", me.worldId).order("opened_on", { ascending: false }).limit(80),
  ]);
  const pm = partyMap(parties);
  const raw = ((invQ.data ?? []) as InvestigationRow[]).map((i) => state.t.investigations.get(i.id) ?? { ...i, crimes: i.crimes ?? [], measures: i.measures ?? [], target_type: i.target_type ?? "PESSOA", party_id: i.party_id ?? null, channel: i.channel ?? null, sentence: i.sentence ?? null });
  // casos anteriores à lista de acusações: deduz pelos atos (atos descobertos são públicos)
  const legacyActs = [...new Set(raw.filter((i) => !i.crimes.length && i.act_ids?.length).flatMap((i) => i.act_ids))];
  const actKind = new Map<string, IllicitKind>();
  if (legacyActs.length) {
    const { data } = await sb.from("illicit_acts").select("id,kind").eq("world_id", me.worldId).in("id", legacyActs);
    for (const a of data ?? []) actKind.set(a.id, a.kind as IllicitKind);
  }
  const invs = raw.map((i) => (i.crimes.length || !i.act_ids?.length ? i : { ...i, crimes: [...new Set(i.act_ids.map((id) => actKind.get(id)).filter((k): k is IllicitKind => !!k && k in CRIMES))] }));
  const st = state.t.person_states.get(me.person.id) ?? me.state;
  const findings = st.findings ?? {};
  const ids = [...new Set([...invs.map((i) => i.person_id).filter((x): x is string => !!x), ...Object.keys(findings).filter((k) => !k.startsWith("party:"))])];
  const people = new Map<string, PersonRow>();
  for (const id of ids) {
    const p = state.t.persons.get(id);
    if (p) people.set(id, p);
  }
  const missing = ids.filter((id) => !people.has(id));
  if (missing.length) {
    const { data } = await sb.from("persons").select("*").eq("world_id", me.worldId).in("id", missing);
    for (const p of (data ?? []) as PersonRow[]) people.set(p.id, p);
  }
  const mine = invs.filter((i) => i.person_id === me.person.id);
  const mineOpen = mine.filter((i) => !i.outcome);
  const reported = invs.filter((i) => i.opened_by === me.person.id);
  const myPartyCases = me.party ? invs.filter((i) => i.target_type === "PARTIDO" && i.party_id === me.party!.id) : [];
  const others = invs.filter((i) => i.person_id !== me.person.id && i.opened_by !== me.person.id);
  const dossiers = Object.entries(findings)
    .map(([key, list]) => ({ key, list: [...list].reverse(), level: st.dossiers?.[key] ?? 0 }))
    .sort((a, b) => b.level - a.level);
  const actions = actionsFor(state, me.person.id, ["INVESTIGACAO"]).filter((a) => a.id !== "responder_oferta");
  const dirty = [...parties].filter((p) => p.status === "ATIVO").sort((a, b) => a.integrity - b.integrity).slice(0, 6);

  return (
    <>
      <GameHeader
        kicker="Bastidores"
        icon="search"
        title="Investigações"
        lede="Dossiês, denúncias, CPIs e processos. Cada caso mostra o que está sendo apurado, a lei, as provas, as medidas e a chance de condenação."
      />

      <div className="hint-band">
        <Icon name="shield" size={18} />
        <span>
          Pessoas reais <b>nunca</b> são acusadas no jogo: elas não aparecem como alvo e não cometem crimes na simulação. Casos envolvem jogadores e personagens fictícios, que
          podem ser filiados a partidos reais.
        </span>
      </div>

      <div className="kpis mb">
        <Kpi icon="alert" label="Casos contra você" value={mineOpen.length} tone={mineOpen.length ? "down" : undefined} hint={mineOpen.length ? "em andamento" : "nenhum aberto"} />
        <Kpi icon="shield" label="Suas denúncias" value={reported.length} hint={`${reported.filter((i) => i.outcome === "CONDENADO").length} com condenação`} />
        <Kpi icon="file" label="Dossiês" value={dossiers.length} hint="pessoas e partidos investigados por você" />
        <Kpi icon="newspaper" label="Casos no país" value={others.filter((i) => !i.outcome).length} hint="em andamento" />
      </div>

      {(mine.length > 0 || myPartyCases.length > 0) && (
        <Panel title="Contra você" icon="alert" tone="alert" className="mb">
          <div className="cases2">
            {[...mine, ...myPartyCases].map((i) => (
              <CaseCard key={i.id} inv={i} year={year} people={people} pm={pm} mine />
            ))}
          </div>
          {st.ineligible_until && st.ineligible_until > state.world.game_date && <p className="form-msg err">Inelegível até {fmtDate(st.ineligible_until)}.</p>}
          {st.jailed_until && st.jailed_until > state.world.game_date && <p className="form-msg err">Em regime fechado até {fmtDate(st.jailed_until)}: só dá para cuidar da defesa.</p>}
        </Panel>
      )}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Seus dossiês" icon="file">
            {dossiers.length ? (
              <div className="dossiers">
                {dossiers.map(({ key, list, level }) => {
                  const isParty = key.startsWith("party:");
                  const party = isParty ? pm[key.slice(6)] : undefined;
                  const person = isParty ? undefined : people.get(key);
                  const proof = list.filter((f) => f.verified && f.act_id).length;
                  return (
                    <article key={key} className="dossier">
                      <div className="dossier__head">
                        <b>{isParty ? `Contas do ${party?.acronym ?? "partido"}` : person ? <a href={`/jogo/${year}/pessoa/${person.id}`}>{person.name}</a> : "Pessoa"}</b>
                        <Pill tone={level >= 0.4 ? "bad" : level >= 0.15 ? "warn" : "neutral"}>{dossierLabel(level)}</Pill>
                      </div>
                      <MeterRow label="Força das provas" value={level * 100} tone="sim" />
                      <ul className="findings">
                        {list.slice(0, 5).map((f) => (
                          <FindingRow key={f.id} f={f} />
                        ))}
                      </ul>
                      <div className="pend__actions">
                        {isParty ? (
                          <>
                            <QuickAction year={year} action="investigar_partido" params={{ party: key.slice(6) }} label="Aprofundar" tone="ghost" icon="search" />
                            {proof > 0 && <QuickAction year={year} action="denunciar_partido" params={{ party: key.slice(6) }} label="Representar ao MP Eleitoral" tone="primary" icon="shield" />}
                          </>
                        ) : person && person.status === "ACTIVE" ? (
                          <>
                            <QuickAction year={year} action="investigar" params={{ target: key }} label="Aprofundar" tone="ghost" icon="search" />
                            {proof > 0 && <QuickAction year={year} action="denunciar" params={{ target: key, authority: "PF" }} label="Denunciar à PF" tone="primary" icon="shield" />}
                            {proof > 0 && <QuickAction year={year} action="vazar_imprensa" params={{ target: key }} label="Vazar" tone="ghost" icon="newspaper" />}
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty icon="file" title="Nenhum dossiê ainda">
                Use “Levantar informações” para investigar uma pessoa ou “Investigar as contas de um partido”. O dossiê mostra cada achado — e também quando não há nada.
              </Empty>
            )}
          </Panel>

          {reported.length > 0 && (
            <Panel title="Casos que você levou às autoridades" icon="shield">
              <div className="cases2">
                {reported.map((i) => (
                  <CaseCard key={i.id} inv={i} year={year} people={people} pm={pm} />
                ))}
              </div>
            </Panel>
          )}

          <Panel title="Casos no país" icon="newspaper" aside={<span className="muted small">{others.length} caso(s)</span>}>
            {others.length ? (
              <div className="cases2">
                {others.slice(0, 20).map((i) => (
                  <CaseCard key={i.id} inv={i} year={year} people={people} pm={pm} />
                ))}
              </div>
            ) : (
              <Empty icon="search" title="Nenhum caso aberto por enquanto" />
            )}
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Investigar e denunciar" icon="play">
            <ActionPanel year={year} actions={actions} />
          </Panel>
          <Panel title="Como um caso anda" icon="info">
            <ul className="rules">
              <li>
                <b>Começo</b>
                <span>Coaf, Tribunal de Contas, imprensa, ex-assessores, adversários, Ministério Público Eleitoral ou a delação de alguém.</span>
              </li>
              <li>
                <b>Investigação</b>
                <span>Quebra de sigilo, busca e apreensão, bloqueio de bens; prisão preventiva quando há obstrução ou desvio muito grande.</span>
              </li>
              <li>
                <b>Processo</b>
                <span>Com provas suficientes, a denúncia é aceita. A defesa pesa no julgamento; colaborar reduz a pena e entrega os parceiros.</span>
              </li>
              <li>
                <b>Pena</b>
                <span>Prisão (com progressão de regime), multa e devolução, cassação em ilícitos eleitorais e inelegibilidade pela Ficha Limpa.</span>
              </li>
            </ul>
          </Panel>
          <Panel title="Integridade dos partidos" icon="scale">
            <p className="muted small" style={{ marginTop: 0 }}>
              Os seis com a menor integridade agora. O índice cai com escândalos de membros e se recupera devagar.
            </p>
            {dirty.map((p) => (
              <MeterRow key={p.id} label={p.acronym} value={p.integrity * 100} tone={p.integrity < 0.4 ? "bad" : "ok"} />
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
