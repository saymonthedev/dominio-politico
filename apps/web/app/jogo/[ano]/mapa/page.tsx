import { UFS, type MandateRow, type VoterSegmentRow } from "@dp/engine";
import { PartyChip } from "@/components/ui";
import { getParties, getSession, partyMap, requireMe } from "@/lib/game";

export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ uf?: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const sel = (await searchParams).uf ?? me.person.uf;
  const { sb } = await getSession();
  const [parties, govQ, segQ] = await Promise.all([
    getParties(me.worldId),
    sb.from("mandates").select("*").eq("world_id", me.worldId).eq("office_code", "GOVERNADOR").in("status", ["ATIVO", "FUTURO"]),
    sb.from("voter_segments").select("*").eq("world_id", me.worldId).eq("uf", sel),
  ]);
  const pm = partyMap(parties);
  const govs = (govQ.data ?? []) as MandateRow[];
  const govIds = govs.map((g) => g.person_id);
  const { data: govPeople } = govIds.length ? await sb.from("persons").select("id,name,party_id").eq("world_id", me.worldId).in("id", govIds) : { data: [] };
  const govByUf = new Map<string, { name: string; party_id: string | null; status: string }>();
  for (const g of govs.sort((a, b) => (a.status === "ATIVO" ? -1 : 1))) {
    const p = (govPeople ?? []).find((x) => x.id === g.person_id);
    if (p && !govByUf.has(g.geo)) govByUf.set(g.geo, { name: p.name, party_id: p.party_id, status: g.status });
  }
  const strongest = (uf: string) => [...parties].sort((a, b) => (b.territory[uf] ?? 0) - (a.territory[uf] ?? 0))[0];
  const segs = (segQ.data ?? []) as VoterSegmentRow[];
  const uf = UFS.find((u) => u.code === sel)!;
  const ranking = [...parties].sort((a, b) => (b.territory[sel] ?? 0) - (a.territory[sel] ?? 0)).slice(0, 8);
  return (
    <div className="layout-main">
      <section>
        <h1>Mapa político</h1>
        <p className="muted">Cada estado colorido pelo partido mais forte na Câmara local (votação para deputado federal). Clique para detalhar.</p>
        <div className="tilemap" style={{ gridTemplateRows: "repeat(7, auto)" }}>
          {UFS.map((u) => {
            const top = strongest(u.code);
            return (
              <a
                key={u.code}
                href={`?uf=${u.code}`}
                className={`tile ${u.code === me.person.uf ? "me" : ""}`}
                style={{ gridColumn: u.grid[0] + 1, gridRow: u.grid[1] + 1, background: top?.color ?? "var(--planalto)", outline: u.code === sel ? "3px solid var(--tinta)" : undefined }}
                title={`${u.name}: ${top?.acronym}`}
              >
                {u.code}
                <small>{top?.acronym}</small>
              </a>
            );
          })}
        </div>
      </section>
      <aside className="stack">
        <div className="card">
          <div className="label">{uf.name} · capital {uf.capital}</div>
          <p className="mono mt" style={{ margin: "6px 0" }}>{uf.electorate.toLocaleString("pt-BR")} eleitores · {uf.fedSeats} deputados federais</p>
          {govByUf.get(sel) && (
            <p style={{ fontSize: ".9rem" }}>
              Governo: <b>{govByUf.get(sel)!.name}</b> <PartyChip party={govByUf.get(sel)!.party_id ? pm[govByUf.get(sel)!.party_id!] : null} />{" "}
              {govByUf.get(sel)!.status === "FUTURO" && <span className="badge warn plain">posse marcada</span>}
            </p>
          )}
          <div className="label mt">Força dos partidos</div>
          {ranking.map((p) => (
            <div key={p.id} className="row between" style={{ fontSize: ".85rem", padding: "3px 0" }}>
              <PartyChip party={p} href={`/jogo/${year}/partidos/${p.id}`} />
              <span className="mono">{Math.round((p.territory[sel] ?? 0) * 100)}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="label">Eleitorado (segmentos agregados)</div>
          {segs.sort((a, b) => b.weight - a.weight).map((s) => (
            <div key={s.id} className="row between mt" style={{ fontSize: ".82rem" }}>
              <span>{s.segment.replaceAll("_", " ")}</span>
              <span className="mono">{Math.round(s.weight * 100)}% · econ {s.ideology.economy} · cost {s.ideology.social}</span>
            </div>
          ))}
          <p className="muted mt" style={{ fontSize: ".75rem" }}>Calibrado para reproduzir o 2º turno presidencial real do ponto de partida.</p>
        </div>
      </aside>
    </div>
  );
}
