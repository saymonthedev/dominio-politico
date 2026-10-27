import { AUTHORITY_LABEL, STAGE_LABEL, type IllicitActRow, type InvestigationRow, type PersonRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Meter, PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

const OUTCOME: Record<string, string> = { CONDENADO: "condenado(a)", ABSOLVIDO: "absolvido(a)", ARQUIVADO: "arquivado" };

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
  const mine = invs.filter((i) => i.person_id === me.person.id);
  const reported = invs.filter((i) => i.opened_by === me.person.id);
  const actions = actionsFor(state, me.person.id, ["INVESTIGACAO"]);
  const dirty = [...parties].sort((a, b) => a.integrity - b.integrity).slice(0, 6);
  return (
    <div className="layout-main">
      <section>
        <h1>Investigações</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          Crimes funcionam por <b>risco e evidência</b>: valor, participantes, testemunhas, rastro documental, recorrência, exposição e lealdade dos cúmplices.
          Os envolvidos são sempre jogadores ou personagens do jogo — pessoas reais nunca são acusadas.
        </p>
        {me.state.offers.length > 0 && (
          <div className="card" style={{ borderColor: "var(--urgente)" }}>
            <div className="label" style={{ color: "var(--urgente)" }}>Oferta pendente</div>
            {me.state.offers.map((o) => (
              <p key={o.id} className="mt" style={{ margin: 0 }}>
                {o.kind === "PROPINA" ? "Propina" : "Caixa dois"} de <b>{fmtMoney(o.amount)}</b> oferecido por {state.t.persons.get(o.from)?.name ?? "intermediário"}. Use “Responder a uma oferta ilícita”.
              </p>
            ))}
          </div>
        )}
        <div className="rule-title"><h2>Polícia, MP, CPI e defesa</h2></div>
        <ActionPanel year={year} actions={actions} />

        <div className="rule-title"><h2>Casos em andamento no país</h2></div>
        <div className="table-wrap card flat">
          <table>
            <thead><tr><th>Investigado(a)</th><th>Conduzido por</th><th>Etapa</th><th>Provas</th><th>Aberto</th></tr></thead>
            <tbody>
              {invs.map((i) => {
                const p = people.get(i.person_id);
                return (
                  <tr key={i.id}>
                    <td>
                      <a href={`/jogo/${year}/pessoa/${i.person_id}`}>{p?.name ?? "—"}</a> {p?.party_id && <PartyChip party={pm[p.party_id]} />}
                      {i.person_id === me.person.id && <span className="badge bad plain">você</span>}
                      {i.opened_by === me.person.id && <span className="badge gold plain">sua denúncia</span>}
                    </td>
                    <td>{AUTHORITY_LABEL[i.authority]}</td>
                    <td>{i.outcome ? <span className={`badge ${i.outcome === "CONDENADO" ? "bad" : "real"}`}>{OUTCOME[i.outcome]}</span> : STAGE_LABEL[i.stage]}</td>
                    <td style={{ minWidth: 90 }}><Meter value={i.evidence * 100} tone="bad" /></td>
                    <td className="mono">{fmtDate(i.opened_on)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!invs.length && <p className="muted">Nenhum caso aberto por enquanto.</p>}
        </div>
      </section>
      <aside className="stack">
        <div className="card">
          <div className="label">Contra você</div>
          {mine.length ? mine.map((i) => (
            <div key={i.id} className="mt" style={{ fontSize: ".86rem" }}>
              <b>{STAGE_LABEL[i.stage]}</b> · {AUTHORITY_LABEL[i.authority]}
              <div className="row between muted"><span>Provas</span><span className="mono">{Math.round(i.evidence * 100)}%</span></div>
              <Meter value={i.evidence * 100} tone="bad" />
              <div className="row between muted"><span>Defesa</span><span className="mono">{Math.round(i.defense * 100)}%</span></div>
              <Meter value={i.defense * 100} tone="ok" />
            </div>
          )) : <p className="muted mt">Nenhuma investigação contra você.</p>}
          {me.state.ineligible_until && <p className="form-msg err">Inelegível até {fmtDate(me.state.ineligible_until)}.</p>}
        </div>
        <div className="card">
          <div className="label">Seus segredos</div>
          {myActs.length ? myActs.map((a) => (
            <div key={a.id} className="mt" style={{ fontSize: ".85rem" }}>
              <b>{a.description}</b> · {fmtMoney(a.amount)}
              <div className="muted">{a.discovered ? "Descoberto" : `Ainda oculto · rastro ${Math.round(a.paper_trail * 100)}% · ${a.witnesses} testemunha(s)`}</div>
            </div>
          )) : <p className="muted mt">Ficha limpa — por enquanto.</p>}
        </div>
        <div className="card">
          <div className="label">Seus dossiês</div>
          {Object.entries(me.state.dossiers).length ? Object.entries(me.state.dossiers).sort((a, b) => b[1] - a[1]).map(([pid, v]) => (
            <div key={pid} className="mt" style={{ fontSize: ".85rem" }}>
              <div className="row between"><span>{state.t.persons.get(pid)?.name ?? pid}</span><span className="mono">{Math.round(v * 100)}%</span></div>
              <Meter value={v * 100} tone="sim" />
            </div>
          )) : <p className="muted mt">Use “Levantar informações” para montar dossiês.</p>}
        </div>
        <div className="card">
          <div className="label">Integridade dos partidos (emergente)</div>
          {dirty.map((p) => (
            <div key={p.id} className="mt" style={{ fontSize: ".82rem" }}>
              <div className="row between"><PartyChip party={p} /><span className="mono">{Math.round(p.integrity * 100)}</span></div>
              <Meter value={p.integrity * 100} tone={p.integrity < 0.4 ? "bad" : "ok"} />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
