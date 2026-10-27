import { notFound } from "next/navigation";
import { AXES, AXIS_INFO, OFFICES, geoName, type MandateRow, type NewsRow, type PersonRow } from "@dp/engine";
import { NewsItem, PartyChip } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { citiesFor } from "@/lib/sim";

export default async function Page({ params }: { params: Promise<{ ano: string; id: string }> }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const cities = await citiesFor(year);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [{ data: p }, mQ, nQ, parties] = await Promise.all([
    sb.from("persons").select("*").eq("world_id", me.worldId).eq("id", id).maybeSingle(),
    sb.from("mandates").select("*").eq("world_id", me.worldId).eq("person_id", id).order("start_on", { ascending: false }),
    sb.from("news_articles").select("*").eq("world_id", me.worldId).contains("person_ids", [id]).order("tick", { ascending: false }).limit(15),
    getParties(me.worldId),
  ]);
  if (!p) notFound();
  const person = p as PersonRow;
  const pm = partyMap(parties);
  const mandates = (mQ.data ?? []) as MandateRow[];
  const news = (nQ.data ?? []) as NewsRow[];
  const real = person.kind === "REAL_ACTIVE_AT_SNAPSHOT" || person.kind === "REAL_HISTORICAL";
  return (
    <div className="layout-main">
      <section>
        <div className="label">{real ? "Pessoa real · dados públicos do TSE" : person.kind === "PLAYER" ? "Jogador(a)" : "Personagem gerado pelo jogo"}</div>
        <h1>{person.name}</h1>
        <p className="muted">
          {person.office_code ? `${OFFICES[person.office_code].name} · ` : person.role_label ? `${person.role_label} · ` : ""}
          {person.uf} · <PartyChip party={person.party_id ? pm[person.party_id] : null} />
          {person.status !== "ACTIVE" && <> · {person.status_note}</>}
        </p>
        {real && (
          <div className="card flat" style={{ fontSize: ".85rem" }}>
            Fatos do snapshot vêm do TSE. Depois da data de início, a atuação desta pessoa no jogo é <span className="badge sim">Simulação</span>. O jogo não
            atribui a pessoas reais crimes, falas, saúde ou vida íntima inventados.
          </div>
        )}
        <div className="rule-title"><h2>No noticiário</h2></div>
        {news.length ? news.map((n) => <NewsItem key={n.id} n={n} />) : <div className="empty">Sem notícias recentes.</div>}
      </section>
      <aside className="stack">
        <div className="card">
          <div className="label">Mandatos</div>
          {mandates.length ? (
            mandates.map((m) => (
              <div key={m.id} className="mt" style={{ fontSize: ".85rem" }}>
                <b>{OFFICES[m.office_code].name}</b> · {geoName(m.geo, { cities })}
                <div className="muted mono">{fmtDate(m.start_on)} → {fmtDate(m.end_on)} · {m.status.toLowerCase()}</div>
              </div>
            ))
          ) : (
            <p className="muted mt">Nenhum mandato registrado.</p>
          )}
        </div>
        <div className="card">
          <div className="label">{real ? "Posição estimada (pelo partido)" : "Posições"}</div>
          {AXES.map((ax) => (
            <div key={ax} className="row between mt" style={{ fontSize: ".82rem" }}>
              <span>{AXIS_INFO[ax].label}</span>
              <span className="mono">{person.ideology[ax]}</span>
            </div>
          ))}
          <div className="row between mt" style={{ fontSize: ".82rem" }}><span>Reputação</span><span className="mono">{Math.round(person.reputation)}</span></div>
        </div>
      </aside>
    </div>
  );
}
