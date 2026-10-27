import { AXES, AXIS_INFO, ENTRY_CULTURE_LABEL, profession, type AffiliationRequestRow, type WorldEventRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Meter, PartyChip, STAGE_LABEL, STAGES, Stat } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, reqQ, evQ] = await Promise.all([
    cachedState(me.worldId),
    getParties(me.worldId),
    sb.from("affiliation_requests").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("created_on", { ascending: false }).limit(10),
    sb.from("world_events").select("*").eq("world_id", me.worldId).contains("actors", [me.person.id]).order("tick", { ascending: false }).limit(25),
  ]);
  const pm = partyMap(parties);
  const actions = actionsFor(state, me.person.id, ["BASE", "PARTIDO"]);
  const requests = (reqQ.data ?? []) as AffiliationRequestRow[];
  const events = (evQ.data ?? []) as WorldEventRow[];
  const st = me.state;
  const stageIdx = STAGES.indexOf(me.person.stage);
  return (
    <div className="layout-main">
      <section>
        <div className="row" style={{ gap: 14 }}>
          <div className="avatar" style={{ background: me.party?.color ?? "var(--planalto)", width: 56, height: 56, fontSize: "1.3rem" }}>
            {me.person.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          <div>
            <h1 style={{ margin: 0 }}>{me.person.name}</h1>
            <div className="muted">
              {profession(me.person.profession).label} · {Number(state.world.game_date.slice(0, 4)) - me.person.birth_year} anos · {me.person.municipality} ({me.person.uf}) ·{" "}
              <PartyChip party={me.party} />
            </div>
          </div>
        </div>

        <div className="card mt">
          <div className="label">Trajetória</div>
          <div className="row mt" style={{ gap: 6 }}>
            {STAGES.map((s, i) => (
              <span key={s} className={`badge plain ${i === stageIdx ? "gold" : i < stageIdx ? "real" : ""}`}>
                {STAGE_LABEL[s]}
              </span>
            ))}
          </div>
        </div>

        <div className="rule-title">
          <h2>Ações</h2>
          <span className="muted">Energia {Math.round(st.energy)}/100 · recupera 25 por dia de jogo</span>
        </div>
        <ActionPanel year={year} actions={actions} />

        <div className="rule-title">
          <h2>Pedidos e convites de filiação</h2>
        </div>
        {requests.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Partido</th><th>Tipo</th><th>Data</th><th>Situação</th><th>Motivo</th></tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td><PartyChip party={pm[r.party_id]} /></td>
                    <td>{r.kind === "CONVITE" ? "Convite" : "Pedido"}</td>
                    <td className="mono">{fmtDate(r.created_on)}</td>
                    <td><span className={`badge ${r.status === "ACEITO" ? "real" : r.status === "RECUSADO" ? "bad" : "warn"}`}>{r.status.toLowerCase()}</span></td>
                    <td className="muted">{r.reason ?? (r.status === "PENDENTE" ? `Resposta até ${fmtDate(r.decide_on)}` : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Nenhum pedido ainda. {me.person.party_id ? "" : "Explore os partidos e peça filiação quando estiver pronto(a)."}</div>
        )}

        <div className="rule-title">
          <h2>Histórico</h2>
        </div>
        <div className="card flat">
          {events.length ? (
            events.map((ev) => (
              <div key={ev.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--linha)", fontSize: ".88rem" }}>
                <span className="mono muted" style={{ width: 96 }}>{fmtDate(ev.game_date)}</span>
                <span>{String((ev.payload as { message?: string }).message ?? ev.type.toLowerCase().replaceAll("_", " "))}</span>
              </div>
            ))
          ) : (
            <p className="muted">Sua história começa agora.</p>
          )}
        </div>
      </section>

      <aside className="stack">
        <div className="card">
          <div className="label">Indicadores</div>
          <div className="grid mt" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Stat label="Caixa" value={fmtMoney(st.money)} />
            <Stat label="Energia" value={Math.round(st.energy)} />
          </div>
          {[
            ["Reputação", me.person.reputation],
            ["Visibilidade", me.person.visibility],
            [`Reconhecimento em ${me.person.uf}`, (st.reach[me.person.uf] ?? 0) * 100],
            ["Capital político", st.political_capital],
            ["Prestígio no partido", st.party_standing],
            ["Preparo para debates", st.debate_prep],
            ["Ativismo", Math.min(100, st.activism)],
          ].map(([l, v]) => (
            <div key={String(l)} className="mt">
              <div className="row between" style={{ fontSize: ".82rem" }}>
                <span>{l}</span>
                <span className="mono">{Math.round(Number(v))}</span>
              </div>
              <Meter value={Number(v)} />
            </div>
          ))}
          <div className="mt">
            <div className="row between" style={{ fontSize: ".82rem" }}>
              <span>Escândalos</span>
              <span className="mono">{Math.round(st.scandal)}</span>
            </div>
            <Meter value={st.scandal} tone="bad" />
          </div>
        </div>

        <div className="card">
          <div className="label">Posições do personagem</div>
          {AXES.map((ax) => (
            <div key={ax} className="mt" style={{ fontSize: ".8rem" }}>
              <div className="row between">
                <b>{AXIS_INFO[ax].label}</b>
                <span className="mono">{me.person.ideology[ax]}</span>
              </div>
              <div style={{ position: "relative", height: 8, background: "var(--rebaixada)", borderRadius: 999 }}>
                <span style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 12, background: "var(--linha)" }} />
                <span style={{ position: "absolute", left: `calc(${(me.person.ideology[ax] + 100) / 2}% - 6px)`, top: -2, width: 12, height: 12, borderRadius: 999, background: "var(--faixa)" }} />
              </div>
              <div className="row between muted" style={{ fontSize: ".68rem" }}>
                <span>{AXIS_INFO[ax].neg}</span>
                <span>{AXIS_INFO[ax].pos}</span>
              </div>
            </div>
          ))}
        </div>

        {me.party && (
          <div className="card">
            <div className="label">Seu partido</div>
            <h3 className="mt"><PartyChip party={me.party} href={`/jogo/${year}/partidos/${me.party.id}`} /> {me.party.name}</h3>
            <p className="muted" style={{ fontSize: ".85rem" }}>{ENTRY_CULTURE_LABEL[me.party.entry_culture]}</p>
            <div className="row between" style={{ fontSize: ".82rem" }}><span>Filiado(a) desde</span><span className="mono">{fmtDate(st.filiation_date)}</span></div>
          </div>
        )}
      </aside>
    </div>
  );
}
