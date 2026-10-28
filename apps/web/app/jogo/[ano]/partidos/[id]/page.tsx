import { notFound } from "next/navigation";
import { AXES, AXIS_INFO, ENTRY_CULTURE_LABEL, OFFICES, UFS, type FactionRow, type PersonRow } from "@dp/engine";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Meter, PartyChip, Stat } from "@/components/ui";
import { photoOf } from "@/lib/photos";
import { fmtMoney, fmtNum } from "@/lib/format";
import { getParties, getSession, requireMe } from "@/lib/game";

export default async function Page({ params }: { params: Promise<{ ano: string; id: string }> }) {
  const { ano, id } = await params;
  const year = Number(ano);
  const me = await requireMe(year);
  const party = (await getParties(me.worldId)).find((p) => p.id === id);
  if (!party) notFound();
  const { sb } = await getSession();
  const [facQ, peopleQ] = await Promise.all([
    sb.from("factions").select("*").eq("world_id", me.worldId).eq("party_id", id),
    sb.from("persons").select("*").eq("world_id", me.worldId).eq("party_id", id).eq("status", "ACTIVE").order("tier").order("reputation", { ascending: false }).limit(60),
  ]);
  const factions = (facQ.data ?? []) as FactionRow[];
  const people = (peopleQ.data ?? []) as PersonRow[];
  const topUfs = [...UFS].sort((a, b) => (party.territory[b.code] ?? 0) - (party.territory[a.code] ?? 0)).slice(0, 8);
  return (
    <div className="layout-main">
      <section>
        <div className="label">Partido · nº {party.number}</div>
        <h1>
          <PartyChip party={party} /> {party.name}
        </h1>
        <p className="muted">{party.description}</p>
        <div className="grid grid-4 mt">
          <Stat label="Deputados federais" value={party.seats.camara ?? 0} />
          <Stat label="Senadores" value={party.seats.senado ?? 0} />
          <Stat label="Governos" value={party.seats.governos ?? 0} />
          <Stat label="Filiados (est.)" value={fmtNum(party.members)} />
        </div>
        <div className="rule-title"><h2>Quadros conhecidos</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Cargo/papel</th><th>UF</th><th className="num">Reputação</th></tr></thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td><span className="who-cell"><PersonAvatar name={p.name} color={party.color} photo={photoOf(p)} size={30} /><a href={`/jogo/${year}/pessoa/${p.id}`}>{p.name}</a></span> {p.kind === "FICTIONAL_GENERATED" ? <span className="badge plain">personagem do jogo</span> : p.kind === "PLAYER" ? <span className="badge gold plain">jogador</span> : <span className="badge real plain">pessoa real</span>}</td>
                  <td className="muted">{p.office_code ? OFFICES[p.office_code].name : p.role_label ?? "—"}</td>
                  <td>{p.uf}</td>
                  <td className="num mono">{Math.round(p.reputation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="stack">
        <div className="card">
          <div className="label">Entrada</div>
          <p className="mt">{ENTRY_CULTURE_LABEL[party.entry_culture]}</p>
          <div className="row between" style={{ fontSize: ".85rem" }}><span>Disciplina</span><span className="mono">{Math.round(party.discipline * 100)}%</span></div>
          <div className="row between" style={{ fontSize: ".85rem" }}><span>Caixa do partido</span><span className="mono">{fmtMoney(party.cash)}</span></div>
          <div className="mt" style={{ fontSize: ".85rem" }}>Integridade (emergente)</div>
          <Meter value={party.integrity * 100} tone={party.integrity < 0.4 ? "bad" : "ok"} />
          <div className="mt" style={{ fontSize: ".85rem" }}>Reputação</div>
          <Meter value={party.reputation} />
        </div>
        <div className="card">
          <div className="label">Alas internas</div>
          {factions.map((f) => (
            <div key={f.id} className="mt">
              <div className="row between" style={{ fontSize: ".88rem" }}><b>{f.name}</b><span className="mono">{Math.round(f.strength * 100)}%</span></div>
              <Meter value={f.strength * 100} tone="sim" />
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Posição (calibração do jogo)</div>
          {AXES.map((ax) => (
            <div key={ax} className="row between mt" style={{ fontSize: ".82rem" }}>
              <span>{AXIS_INFO[ax].label}</span>
              <span className="mono">{party.ideology[ax]}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Onde é forte</div>
          {topUfs.map((u) => (
            <div key={u.code} className="mt" style={{ fontSize: ".82rem" }}>
              <div className="row between"><span>{u.name}</span><span className="mono">{Math.round((party.territory[u.code] ?? 0) * 100)}</span></div>
              <Meter value={(party.territory[u.code] ?? 0) * 100} />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
