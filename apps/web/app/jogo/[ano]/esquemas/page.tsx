import { actRisk, CHANNEL_LABEL, CRIMES, Ctx, OFFICES, SPHERE_LABEL, type DetectionChannel, type IllicitActRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, Panel, Pill } from "@/components/game/Page";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getSession, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, actsQ] = await Promise.all([
    cachedState(me.worldId),
    sb.from("illicit_acts").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("created_on", { ascending: false }).limit(60),
  ]);
  const ctx = new Ctx(state, "view");
  const st = state.t.person_states.get(me.person.id) ?? me.state;
  const fromDb = (actsQ.data ?? []) as IllicitActRow[];
  // o estado do motor é mais recente para atos em andamento
  const acts = fromDb.map((a) => state.t.illicit_acts.get(a.id) ?? a);
  const ongoing = acts.filter((a) => a.ongoing && !a.discovered);
  const hidden = acts.filter((a) => !a.discovered);
  const exposed = acts.filter((a) => a.discovered);
  const monthly = ongoing.reduce((s, a) => s + a.monthly_gain, 0);
  const maxRisk = hidden.reduce((m, a) => Math.max(m, actRisk(ctx, a)), 0);
  const actions = actionsFor(state, me.person.id, ["ESQUEMA"]);
  const offers = st.offers ?? [];

  return (
    <>
      <GameHeader
        kicker="Bastidores"
        icon="key"
        title="Esquemas"
        lede="Condutas ilegais que o jogo simula por risco e evidência: o que rende, o rastro que deixa e por onde costuma ser descoberto. Só jogadores e personagens fictícios participam."
      />

      <div className="kpis mb">
        <Kpi icon="coins" label="Dinheiro não declarado" value={fmtMoney(st.dirty_money ?? 0)} hint="fora da conta e da declaração" tone={(st.dirty_money ?? 0) > 0 ? "warn" : undefined} />
        <Kpi icon="clock" label="Esquemas em andamento" value={ongoing.length} hint={ongoing.length ? `${fmtMoney(monthly)} por mês` : "nenhum"} />
        <Kpi icon="alert" label="Maior risco agora" value={hidden.length ? pct(maxRisk) : "—"} hint="chance relativa de alguém perceber" tone={maxRisk > 0.6 ? "down" : undefined} />
        <Kpi icon="search" label="Já descobertos" value={exposed.length} tone={exposed.length ? "down" : undefined} />
      </div>

      {offers.length > 0 && (
        <Panel title="Ofertas na mesa" icon="alert" tone="alert" className="mb">
          <div className="reqs">
            {offers.map((o) => (
              <div key={o.id} className="pend">
                <div className="pend__text">
                  <b>
                    {o.kind === "PROPINA" ? "Propina" : "Caixa dois"} de {fmtMoney(o.amount)}
                  </b>
                  <span className="muted small" style={{ display: "block" }}>
                    Oferecido por {state.t.persons.get(o.from)?.name ?? "um intermediário"}. Aceitar vira dinheiro não declarado e deixa rastro; denunciar protege sua ficha.
                  </span>
                </div>
                <div className="pend__actions">
                  <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                  <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "DENUNCIAR" }} label="Denunciar à PF" tone="primary" icon="shield" />
                  <QuickAction year={year} action="responder_oferta" params={{ offer: o.id, decision: "ACEITAR" }} label="Aceitar" tone="danger" />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Seus esquemas" icon="key">
            {acts.length ? (
              <div className="schemes">
                {acts.map((a) => {
                  const def = CRIMES[a.kind];
                  const risk = a.discovered ? 1 : actRisk(ctx, a);
                  return (
                    <article key={a.id} className={`scheme${a.discovered ? " is-exposed" : a.ongoing ? " is-live" : ""}`}>
                      <div className="scheme__head">
                        <b>{def?.label ?? a.kind}</b>
                        {a.discovered ? <Pill tone="bad">descoberto</Pill> : a.ongoing ? <Pill tone="warn">em andamento</Pill> : <Pill>encerrado</Pill>}
                      </div>
                      <p>{a.description}</p>
                      <div className="scheme__nums">
                        <span>
                          <small>Rendeu</small>
                          <b className="mono">{fmtMoney(a.amount)}</b>
                        </span>
                        {a.ongoing && (
                          <span>
                            <small>Por mês</small>
                            <b className="mono">{fmtMoney(a.monthly_gain)}</b>
                          </span>
                        )}
                        <span>
                          <small>Testemunhas</small>
                          <b className="mono">{a.witnesses}</b>
                        </span>
                        <span>
                          <small>Rastro</small>
                          <b className="mono">{pct(a.paper_trail)}</b>
                        </span>
                      </div>
                      {!a.discovered && (
                        <div className="scheme__risk">
                          <span>Risco de descoberta</span>
                          <i>
                            <em style={{ width: pct(risk) }} />
                          </i>
                          <b className="mono">{pct(risk)}</b>
                        </div>
                      )}
                      <small className="muted">
                        {def ? def.law(Number(a.created_on.slice(0, 4))) : ""} · desde {fmtDate(a.created_on)}
                        {a.discovered_on ? ` · descoberto em ${fmtDate(a.discovered_on)}` : ""}
                      </small>
                      {a.ongoing && !a.discovered && (
                        <div>
                          <QuickAction year={year} action="encerrar_esquema" params={{ scheme: a.id }} label="Encerrar esquema" tone="ghost" icon="x" />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <Empty icon="shield" title="Ficha limpa">
                Você não praticou nenhuma conduta ilegal. As opções abaixo dependem do seu cargo e do momento (campanha, partido, investigação).
              </Empty>
            )}
          </Panel>

          <Panel title="O que dá para fazer" icon="play" aside={<span className="muted small">mecânica de jogo, não instrução</span>}>
            <ActionPanel year={year} actions={actions} empty="Nenhuma conduta ilegal está ao seu alcance agora." />
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Como os crimes funcionam no jogo" icon="scale">
            <p className="small" style={{ marginTop: 0 }}>
              Cada conduta tem uma <b>oportunidade</b> (cargo, campanha, partido), um <b>ganho</b>, um <b>rastro</b> (documentos e testemunhas) e{" "}
              <b>canais</b> por onde costuma vir à tona. Quanto mais tempo, dinheiro e gente envolvida, maior o risco.
            </p>
            <div className="crimecat">
              {Object.values(CRIMES).map((c) => (
                <div key={c.kind} className="crimecat__item">
                  <div className="crimecat__head">
                    <b>{c.label}</b>
                    <Pill tone={c.sphere === "ELEITORAL" ? "warn" : c.sphere === "IMPROBIDADE" ? "sim" : "bad"}>{SPHERE_LABEL[c.sphere]}</Pill>
                  </div>
                  <p>{c.summary}</p>
                  <small>
                    <Icon name="scale" size={12} /> {c.law(year)}
                  </small>
                  <small>
                    <Icon name="user" size={12} /> {c.offices.length ? c.offices.map((o) => OFFICES[o].name.toLowerCase()).join(", ") : "depende do momento (campanha, partido, dinheiro guardado)"}
                  </small>
                  <small>
                    <Icon name="search" size={12} />{" "}
                    {(Object.keys(c.channels) as DetectionChannel[])
                      .slice(0, 3)
                      .map((k) => CHANNEL_LABEL[k])
                      .join("; ")}
                  </small>
                  <small>
                    <Icon name="alert" size={12} />{" "}
                    {[c.penalty.years[1] > 0 ? `até ${c.penalty.years[1]} anos de prisão` : "sem prisão", c.penalty.cassation ? "cassação" : "", c.penalty.ineligible ? "inelegibilidade" : "", "multa"].filter(Boolean).join(", ")}
                  </small>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
