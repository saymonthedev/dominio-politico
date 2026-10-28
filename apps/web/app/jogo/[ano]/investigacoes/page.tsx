import { AUTHORITY_LABEL, STAGE_LABEL, type IllicitActRow, type InvestigationRow, type PersonRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, MeterRow, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { PersonAvatar } from "@/components/PersonAvatar";
import { PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";
import { cachedState } from "@/lib/sim";

const OUTCOME: Record<string, { label: string; tone: "bad" | "ok" | "neutral" }> = {
  CONDENADO: { label: "condenado(a)", tone: "bad" },
  ABSOLVIDO: { label: "absolvido(a)", tone: "ok" },
  ARQUIVADO: { label: "arquivado", tone: "neutral" },
};

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, invQ, actsQ] = await Promise.all([
    cachedState(me.worldId),
    getParties(me.worldId),
    sb.from("investigations").select("*").eq("world_id", me.worldId).order("opened_on", { ascending: false }).limit(40),
    sb.from("illicit_acts").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("created_on", { ascending: false }),
  ]);
  const pm = partyMap(parties);
  const invs = (invQ.data ?? []) as InvestigationRow[];
  const myActs = (actsQ.data ?? []) as IllicitActRow[];
  const ids = [...new Set(invs.map((i) => i.person_id))];
  const people = new Map<string, PersonRow>();
  if (ids.length) {
    const { data } = await sb.from("persons").select("*").eq("world_id", me.worldId).in("id", ids);
    for (const p of (data ?? []) as PersonRow[]) people.set(p.id, p);
  }
  const mine = invs.filter((i) => i.person_id === me.person.id && !i.outcome);
  const others = invs.filter((i) => i.person_id !== me.person.id);
  const actions = actionsFor(state, me.person.id, ["INVESTIGACAO"]);
  const offerAction = actions.find((a) => a.id === "responder_oferta");
  const restActions = actions.filter((a) => a.id !== "responder_oferta");
  const offers = me.state.offers;
  const dirty = [...parties].sort((a, b) => a.integrity - b.integrity).slice(0, 6);
  const dossiers = Object.entries(me.state.dossiers).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <GameHeader
        kicker="Bastidores"
        icon="gavel"
        title="Investigações"
        lede="Polícia Federal, Ministério Público, CPIs e imprensa. Crimes funcionam por risco e evidência; os envolvidos são sempre jogadores ou personagens do jogo."
      />

      <div className="hint-band">
        <Icon name="shield" size={18} />
        <span>
          Pessoas reais <b>nunca</b> são acusadas no jogo. Ofertas, casos e condenações envolvem apenas personagens fictícios e jogadores.
        </span>
      </div>

      {offers.length > 0 && (
        <Panel title="Oferta ilícita na mesa" icon="alert" tone="alert" className="mb">
          <div className="reqs">
            {offers.map((o) => (
              <div key={o.id} className="pend">
                <div className="pend__text">
                  <b>
                    {o.kind === "PROPINA" ? "Propina" : "Caixa dois"} de {fmtMoney(o.amount)}
                  </b>
                  <span className="muted small" style={{ display: "block" }}>
                    Oferecido por {state.t.persons.get(o.from)?.name ?? "um intermediário"}. Aceitar deixa rastro; recusar ou denunciar protege sua ficha.
                  </span>
                </div>
                {offerAction && !offerAction.reason && (
                  <div className="pend__actions">
                    <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                    <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "DENUNCIAR" }} label="Denunciar à PF" tone="primary" icon="shield" />
                    <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "ACEITAR" }} label="Aceitar" tone="danger" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          {mine.length > 0 && (
            <Panel title="Investigações contra você" icon="alert" tone="alert">
              {mine.map((i) => (
                <div key={i.id} className="case">
                  <div className="case__head">
                    <b>{AUTHORITY_LABEL[i.authority]}</b>
                    <Pill tone="warn">{STAGE_LABEL[i.stage]}</Pill>
                    <span className="mono muted small">próximo passo {fmtDate(i.next_step_on)}</span>
                  </div>
                  <MeterRow label="Provas reunidas" value={i.evidence * 100} tone="bad" />
                  <MeterRow label="Força da sua defesa" value={i.defense * 100} tone="ok" />
                </div>
              ))}
              {me.state.ineligible_until && <p className="form-msg err">Inelegível até {fmtDate(me.state.ineligible_until)}.</p>}
            </Panel>
          )}

          <Panel title="Polícia, MP, CPI e defesa" icon="play">
            <ActionPanel year={year} actions={restActions} />
          </Panel>

          <Panel title="Casos no país" icon="newspaper" aside={<span className="muted small">{others.length} caso(s)</span>}>
            {others.length ? (
              <div className="cases">
                {others.map((i) => {
                  const p = people.get(i.person_id);
                  const party = p?.party_id ? pm[p.party_id] : undefined;
                  return (
                    <a key={i.id} className="caserow" href={`/jogo/${year}/pessoa/${i.person_id}`}>
                      <PersonAvatar name={p?.name ?? "?"} color={party?.color} photo={p ? photoOf(p) : undefined} size={36} />
                      <div className="caserow__who">
                        <b>{p?.name ?? "—"}</b>
                        <span>
                          {AUTHORITY_LABEL[i.authority]} · desde {fmtDate(i.opened_on)}
                        </span>
                        <span className="pcard__tags">
                          {party && <PartyChip party={party} />}
                          {i.opened_by === me.person.id && <Pill tone="gold">sua denúncia</Pill>}
                        </span>
                      </div>
                      <div className="caserow__state">
                        {i.outcome ? <Pill tone={OUTCOME[i.outcome].tone}>{OUTCOME[i.outcome].label}</Pill> : <Pill tone="warn">{STAGE_LABEL[i.stage]}</Pill>}
                        <i>
                          <em style={{ width: `${i.evidence * 100}%` }} />
                        </i>
                        <small className="mono">provas {Math.round(i.evidence * 100)}%</small>
                      </div>
                    </a>
                  );
                })}
              </div>
            ) : (
              <Empty icon="gavel" title="Nenhum caso aberto por enquanto" />
            )}
          </Panel>
        </div>

        <div className="gstack">
          {mine.length === 0 && (
            <Panel title="Sua ficha" icon="shield">
              <p className="small" style={{ margin: 0 }}>
                Nenhuma investigação aberta contra você.
                {me.state.ineligible_until ? ` Inelegível até ${fmtDate(me.state.ineligible_until)}.` : ""}
              </p>
            </Panel>
          )}

          <Panel title="Seus segredos" icon="lock">
            {myActs.length ? (
              <ul className="agenda">
                {myActs.map((a) => (
                  <li key={a.id} className="req">
                    <div>
                      <b>
                        {a.description} · {fmtMoney(a.amount)}
                      </b>
                      <span>{a.discovered ? "já descoberto" : `rastro ${Math.round(a.paper_trail * 100)}% · ${a.witnesses} testemunha(s)`}</span>
                    </div>
                    <Pill tone={a.discovered ? "bad" : "warn"}>{a.discovered ? "exposto" : "oculto"}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Ficha limpa, por enquanto.
              </p>
            )}
          </Panel>

          <Panel title="Seus dossiês" icon="file">
            {dossiers.length ? (
              dossiers.map(([pid, v]) => <MeterRow key={pid} label={state.t.persons.get(pid)?.name ?? "pessoa"} value={v * 100} tone="sim" />)
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                Use “Levantar informações” para montar dossiês sobre adversários.
              </p>
            )}
          </Panel>

          <Panel title="Integridade dos partidos" icon="scale">
            <p className="muted small" style={{ marginTop: 0 }}>
              Os seis com a menor integridade agora. O índice muda com os escândalos da partida.
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
