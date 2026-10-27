import { OFFICES, type CandidacyRow, type DebateRow, type PollRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Meter, Stat } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney, fmtPct } from "@/lib/format";
import { getSession, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

const STATUS: Record<string, string> = {
  PRE: "Pré-candidatura (aguardando convenção)", HOMOLOGADA: "Candidatura homologada", SEGUNDO_TURNO: "No 2º turno", ELEITO: "Eleito(a)",
  NAO_ELEITO: "Não eleito(a)", SUPLENTE: "Suplente", INDEFERIDA: "Indeferida", DESISTENTE: "Não indicada pelo partido",
};

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, cQ] = await Promise.all([
    cachedState(me.worldId),
    sb.from("candidacies").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("election_id", { ascending: false }).limit(5),
  ]);
  const cands = (cQ.data ?? []) as CandidacyRow[];
  const current = cands[0];
  let polls: PollRow[] = [];
  let debates: DebateRow[] = [];
  if (current) {
    const [p, d] = await Promise.all([
      sb.from("polls").select("*").eq("world_id", me.worldId).eq("race_id", current.race_id).order("game_date", { ascending: false }).limit(6),
      sb.from("debates").select("*").eq("world_id", me.worldId).eq("race_id", current.race_id).order("scheduled_on"),
    ]);
    polls = (p.data ?? []) as PollRow[];
    debates = ((d.data ?? []) as DebateRow[]).filter((x) => x.participants.includes(current.id));
  }
  const campaignActions = actionsFor(state, me.person.id, ["CAMPANHA"]);
  const pre = actionsFor(state, me.person.id, ["PARTIDO"]).filter((a) => a.id === "pre_candidatura");
  const c = current?.campaign;
  return (
    <div className="layout-main">
      <section>
        <h1>Campanha</h1>
        {current ? (
          <div className="card dark">
            <div className="label">{STATUS[current.status] ?? current.status}</div>
            <h2 style={{ margin: "6px 0" }}>{OFFICES[current.office_code].name} · {current.geo}</h2>
            <p style={{ color: "#d5deeb", margin: 0 }}>
              Número {current.ballot_number}
              {current.votes ? ` · ${current.votes.toLocaleString("pt-BR")} votos (${fmtPct(current.vote_share, 2)})` : ""}
              {current.note ? ` · ${current.note}` : ""}
            </p>
          </div>
        ) : (
          <div className="empty">
            Você não tem candidatura. No ano eleitoral, filiado(a) dentro do prazo, lance sua pré-candidatura — a convenção do partido decide.
          </div>
        )}
        {pre.length > 0 && (
          <>
            <div className="rule-title"><h2>Pré-candidatura</h2></div>
            <ActionPanel year={year} actions={pre} />
          </>
        )}
        <div className="rule-title"><h2>Ações de campanha</h2></div>
        <ActionPanel year={year} actions={campaignActions} empty="Ações de campanha liberam com candidatura homologada e campanha oficial aberta." />
      </section>
      <aside className="stack">
        {c && (
          <div className="card">
            <div className="label">Recursos</div>
            <div className="grid mt" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Stat label="Orçamento" value={fmtMoney(c.budget)} />
              <Stat label="Gasto" value={fmtMoney(c.spent)} />
              <Stat label="FEFC" value={fmtMoney(c.fefc)} />
              <Stat label="Doações" value={fmtMoney(c.donations)} />
              <Stat label="Voluntários" value={c.volunteers} />
              <Stat label="Equipe" value={Object.values(c.team).reduce((a, b) => a + b, 0)} />
            </div>
            <div className="mt" style={{ fontSize: ".82rem" }}>Momento da campanha</div>
            <Meter value={(c.momentum + 1) * 50} tone={c.momentum >= 0 ? "ok" : "bad"} />
            <div className="mt" style={{ fontSize: ".82rem" }}>Dano de boatos</div>
            <Meter value={c.rumor_damage * 5} tone="bad" />
          </div>
        )}
        <div className="card">
          <div className="label">Pesquisas</div>
          {polls.length ? (
            polls.map((p) => (
              <div key={p.id} className="mt" style={{ fontSize: ".85rem" }}>
                <b>{p.institute}</b> <span className="mono muted">{fmtDate(p.game_date)}</span> {p.private_for && <span className="badge gold plain">interna</span>}
                {p.results.slice(0, 4).map((r) => (
                  <div key={r.id} className="row between"><span>{r.name} ({r.party})</span><span className="mono">{fmtPct(r.pct)}</span></div>
                ))}
              </div>
            ))
          ) : (
            <p className="muted mt">Sem pesquisas divulgadas para a sua disputa.</p>
          )}
        </div>
        {debates.length > 0 && (
          <div className="card">
            <div className="label">Debates</div>
            {debates.map((d) => (
              <div key={d.id} className="row between mt" style={{ fontSize: ".85rem" }}>
                <span>{d.outlet} · {fmtDate(d.scheduled_on)}</span>
                <span className={`badge ${d.status === "REALIZADO" ? "real" : "warn"} plain`}>{d.status === "REALIZADO" ? "realizado" : d.player_choices[current!.id] ? "estratégia definida" : "sem estratégia"}</span>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
