import type { VotePanel as Panel } from "@dp/engine";
import { fmtDate } from "@/lib/format";

const VOTE = { SIM: "sim", NAO: "não", ABSTENCAO: "abstenção" } as const;
const ORIENT = { SIM: "orientou sim", NAO: "orientou não", ABSTENCAO: "orientou abstenção", LIBERADA: "liberou" } as const;

/**
 * Painel de votação de uma Casa (sugestão do jogador Gabriel do Valle): placar como o painel
 * eletrônico do plenário, o mínimo exigido, o voto de cada bancada e o voto do jogador.
 */
export function VotePanel({ panel, me, colors = {} }: { panel: Panel; me?: string; colors?: Record<string, string> }) {
  const total = panel.seats || 1;
  const mine = me ? panel.players[me] : undefined;
  return (
    <div className={`vpanel${panel.approved ? " is-yes" : " is-no"}`}>
      <div className="vpanel__head">
        <div>
          <b>{panel.house}</b>
          <span className="mono">
            {panel.step} · {fmtDate(panel.date)}
          </span>
        </div>
        <span className="vpanel__result">{panel.approved ? "Aprovado" : "Rejeitado"}</span>
      </div>
      <div className="vpanel__board" role="group" aria-label={`${panel.yes} sim, ${panel.no} não, ${panel.abstain} abstenções e ${panel.absent} ausentes`}>
        <div className="y">
          <b className="mono">{panel.yes}</b>
          <span>sim</span>
        </div>
        <div className="n">
          <b className="mono">{panel.no}</b>
          <span>não</span>
        </div>
        <div className="a">
          <b className="mono">{panel.abstain}</b>
          <span>abstenções</span>
        </div>
        <div className="f">
          <b className="mono">{panel.absent}</b>
          <span>ausentes</span>
        </div>
      </div>
      <div className="vote-split" aria-hidden="true">
        <span className="y" style={{ flex: panel.yes / total }} />
        <span className="n" style={{ flex: panel.no / total }} />
        <span className="a" style={{ flex: (panel.abstain + panel.absent) / total }} />
      </div>
      <p className="vpanel__rule">
        {panel.seats} cadeiras · {panel.rule}
        {mine && (
          <>
            {" "}
            · <b>seu voto: {VOTE[mine]}</b>
          </>
        )}
      </p>
      <details className="vpanel__parties">
        <summary>Voto de cada bancada</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Partido</th>
              <th scope="col">Sim</th>
              <th scope="col">Não</th>
              <th scope="col">Abst.</th>
              <th scope="col">Aus.</th>
              <th scope="col">Bancada</th>
            </tr>
          </thead>
          <tbody>
            {panel.parties.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  <i style={{ background: colors[p.id] ?? "var(--apagado)" }} aria-hidden="true" />
                  {p.acronym} <small>{p.seats}</small>
                </th>
                <td className="mono">{p.yes}</td>
                <td className="mono">{p.no}</td>
                <td className="mono">{p.abstain}</td>
                <td className="mono">{p.absent}</td>
                <td>{ORIENT[p.orientation]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
