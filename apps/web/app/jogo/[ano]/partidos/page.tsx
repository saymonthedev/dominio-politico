import { ENTRY_CULTURE_LABEL, spectrumLabel } from "@dp/engine";
import { Meter, PartyChip } from "@/components/ui";
import { getParties, requireMe } from "@/lib/game";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const parties = (await getParties(me.worldId)).filter((p) => p.status === "ATIVO");
  const sorted = [...parties].sort((a, b) => (b.seats.camara ?? 0) - (a.seats.camara ?? 0) || (b.territory[me.person.uf] ?? 0) - (a.territory[me.person.uf] ?? 0));
  return (
    <>
      <h1>Partidos</h1>
      <p className="muted" style={{ maxWidth: 760 }}>
        Partidos reais do registro do TSE no ponto de partida. Nome, sigla, número, federação e bancadas são fatos; posição nos eixos, cultura de entrada e
        disciplina são calibração do jogo. A <b>integridade</b> começa igual para todos e muda com o que acontece na partida.
      </p>
      <div className="table-wrap card flat">
        <table>
          <thead>
            <tr>
              <th>Partido</th>
              <th>Posição (jogo)</th>
              <th className="num">Câmara</th>
              <th className="num">Senado</th>
              <th>Força em {me.person.uf}</th>
              <th>Integridade</th>
              <th>Entrada</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>
                  <PartyChip party={p} href={`/jogo/${year}/partidos/${p.id}`} />
                  <div className="muted" style={{ fontSize: ".78rem" }}>{p.name} · nº {p.number}{p.federation_name ? ` · ${p.federation_name}` : ""}</div>
                </td>
                <td>{spectrumLabel(p.ideology)}{p.gov_alignment === 1 ? <div className="badge real plain">base do governo</div> : p.gov_alignment === -1 ? <div className="badge warn plain">oposição</div> : null}</td>
                <td className="num mono">{p.seats.camara ?? 0}</td>
                <td className="num mono">{p.seats.senado ?? 0}</td>
                <td style={{ minWidth: 110 }}><Meter value={(p.territory[me.person.uf] ?? 0) * 100} /></td>
                <td style={{ minWidth: 110 }}><Meter value={p.integrity * 100} tone={p.integrity < 0.4 ? "bad" : "ok"} /></td>
                <td className="muted" style={{ fontSize: ".78rem", maxWidth: 220 }}>{ENTRY_CULTURE_LABEL[p.entry_culture]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
