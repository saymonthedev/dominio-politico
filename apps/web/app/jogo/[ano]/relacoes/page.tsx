import { OFFICES, type PersonRow, type RelationshipRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Meter, PartyChip } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, parties, relQ] = await Promise.all([
    cachedState(me.worldId),
    getParties(me.worldId),
    sb.from("relationships").select("*").eq("world_id", me.worldId).eq("a_id", me.person.id).order("score", { ascending: false }),
  ]);
  const pm = partyMap(parties);
  const rels = (relQ.data ?? []) as RelationshipRow[];
  const people = new Map<string, PersonRow>();
  if (rels.length) {
    const { data } = await sb.from("persons").select("*").eq("world_id", me.worldId).in("id", rels.map((r) => r.b_id));
    for (const p of (data ?? []) as PersonRow[]) people.set(p.id, p);
  }
  const actions = actionsFor(state, me.person.id, ["BASE"]).filter((a) => ["conversar", "reuniao_partidaria"].includes(a.id));
  return (
    <div className="layout-main">
      <section>
        <h1>Relações</h1>
        <p className="muted">Relacionamento abre portas: alguns partidos só filiam quem tem padrinho, e convites chegam de quem gosta de você.</p>
        <div className="table-wrap card flat">
          <table>
            <thead><tr><th>Pessoa</th><th>Partido</th><th>Relação</th><th className="num">Conversas</th></tr></thead>
            <tbody>
              {rels.map((r) => {
                const p = people.get(r.b_id);
                return (
                  <tr key={r.id}>
                    <td><a href={`/jogo/${year}/pessoa/${r.b_id}`}>{p?.name ?? "—"}</a><div className="muted" style={{ fontSize: ".78rem" }}>{p?.office_code ? OFFICES[p.office_code].name : p?.role_label ?? ""} · {p?.uf}</div></td>
                    <td><PartyChip party={p?.party_id ? pm[p.party_id] : null} /></td>
                    <td style={{ minWidth: 140 }}><Meter value={(r.score + 100) / 2} tone={r.score >= 0 ? "ok" : "bad"} /> <span className="mono" style={{ fontSize: ".75rem" }}>{Math.round(r.score)}</span></td>
                    <td className="num mono">{r.interactions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rels.length && <p className="muted">Você ainda não conhece ninguém. Vá a eventos e reuniões.</p>}
        </div>
      </section>
      <aside>
        <ActionPanel year={year} actions={actions} />
      </aside>
    </div>
  );
}
