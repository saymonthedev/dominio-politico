import { OFFICES, type BillRow, type MandateRow, type PolicyRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate } from "@/lib/format";
import { getParties, getSession, getWorld, partyMap, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, world, parties, bQ, mQ, pQ] = await Promise.all([
    cachedState(me.worldId),
    getWorld(year),
    getParties(me.worldId),
    sb.from("bills").select("*").eq("world_id", me.worldId).order("vote_on", { ascending: false }).limit(20),
    sb.from("mandates").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("start_on", { ascending: false }),
    sb.from("policies").select("*").eq("world_id", me.worldId).eq("owner_person_id", me.person.id).order("started_on", { ascending: false }),
  ]);
  const pm = partyMap(parties);
  const bills = (bQ.data ?? []) as BillRow[];
  const mandates = (mQ.data ?? []) as MandateRow[];
  const policies = (pQ.data ?? []) as PolicyRow[];
  const actions = actionsFor(state, me.person.id, ["MANDATO"]);
  const base = parties.filter((p) => world?.gov.base_party_ids.includes(p.id));
  const baseSeats = base.reduce((s, p) => s + (p.seats.camara ?? 0), 0);
  return (
    <div className="layout-main">
      <section>
        <h1>Governo e Congresso</h1>
        {mandates.length ? (
          <div className="card dark">
            {mandates.map((m) => (
              <div key={m.id}>
                <div className="label">{m.status === "ATIVO" ? "Mandato em curso" : m.status === "FUTURO" ? "Posse marcada" : "Mandato encerrado"}</div>
                <h2 style={{ margin: "4px 0 10px" }}>{OFFICES[m.office_code].name} · {m.geo}</h2>
                <p style={{ color: "#d5deeb" }} className="mono">{fmtDate(m.start_on)} → {fmtDate(m.end_on)}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Você ainda não tem mandato. Ações de governo e de plenário liberam depois da posse.</div>
        )}
        <div className="rule-title"><h2>Ações de mandato</h2></div>
        <ActionPanel year={year} actions={actions} />
        <div className="rule-title"><h2>Plenário da Câmara</h2></div>
        <div className="table-wrap card flat">
          <table>
            <thead><tr><th>Projeto</th><th>Votação</th><th>Governo</th><th>Resultado</th></tr></thead>
            <tbody>
              {bills.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.title}</b><div className="muted" style={{ fontSize: ".8rem" }}>{b.summary}</div></td>
                  <td className="mono">{fmtDate(b.vote_on)}</td>
                  <td>{b.gov_position > 0 ? "a favor" : b.gov_position < 0 ? "contra" : "liberou"}</td>
                  <td>
                    {b.status === "TRAMITANDO" ? <span className="badge warn">em pauta</span> : <span className={`badge ${b.status === "APROVADO" ? "real" : "bad"}`}>{b.status.toLowerCase()}</span>}
                    {b.status !== "TRAMITANDO" && <div className="mono muted" style={{ fontSize: ".75rem" }}>{b.votes.yes} × {b.votes.no}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!bills.length && <p className="muted">Nenhum projeto em pauta ainda.</p>}
        </div>
      </section>
      <aside className="stack">
        <div className="card">
          <div className="label">Base do governo federal</div>
          <p className="mt mono" style={{ fontSize: "1.4rem", margin: "6px 0" }}>{baseSeats} / 513</p>
          <div className="row">{base.map((p) => <PartyChip key={p.id} party={p} href={`/jogo/${year}/partidos/${p.id}`} />)}</div>
          <p className="muted mt" style={{ fontSize: ".82rem" }}>Postura fiscal: {(world?.gov.fiscal_stance ?? 0) > 0.1 ? "expansionista" : (world?.gov.fiscal_stance ?? 0) < -0.1 ? "contracionista" : "neutra"}</p>
        </div>
        {policies.length > 0 && (
          <div className="card">
            <div className="label">Suas políticas</div>
            {policies.map((p) => (
              <div key={p.id} className="mt" style={{ fontSize: ".85rem" }}>
                <b>{p.title}</b> <span className={`badge plain ${p.status === "CONCLUIDA" ? "real" : p.status === "ATRASADA" ? "bad" : "warn"}`}>{p.status.toLowerCase().replace("_", " ")}</span>
                <div className="muted mono">{fmtDate(p.started_on)} → {fmtDate(p.completes_on)}</div>
              </div>
            ))}
          </div>
        )}
        <div className="card">
          <div className="label">Bancadas</div>
          {[...parties].sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0)).filter((p) => (p.seats.camara ?? 0) > 0).map((p) => (
            <div key={p.id} className="row between" style={{ fontSize: ".85rem", padding: "3px 0" }}>
              <PartyChip party={pm[p.id]} /> <span className="mono">{p.seats.camara} · {p.seats.senado ?? 0} sen.</span>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
