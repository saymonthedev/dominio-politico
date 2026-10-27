import { profileFor } from "@dp/engine";
import { START_POINTS } from "@/lib/startpoints";

const pct = (v: number) => v.toFixed(2).replace(".", ",");

/** Linha do tempo dos pontos de partida (2º turno presidencial real de cada ano). */
export function StartTrack({ hrefFor, taken = new Set() }: { hrefFor: (year: number) => string; taken?: Set<number> }) {
  return (
    <div className="track">
      {START_POINTS.map((s) => {
        const wc = profileFor(s.winnerParty, s.year).color;
        const rc = profileFor(s.rivalParty, s.year).color;
        return (
          <a key={s.year} href={hrefFor(s.year)} className={taken.has(s.year) ? "taken" : undefined}>
            <span className="dot" />
            <div className="card">
              <div className="year">{s.year}</div>
              <div className="who">
                <b>{s.winner}</b> <span className="muted">{s.winnerParty}</span>
              </div>
              <div className="score">
                {pct(s.winnerShare)}% × {pct(s.rivalShare)}%
              </div>
              <div className="bar" aria-hidden="true">
                <span style={{ width: `${s.winnerShare}%`, background: wc }} />
                <span style={{ width: `${s.rivalShare}%`, background: rc, opacity: 0.6 }} />
              </div>
              <div className="score">vs. {s.rival}</div>
              {taken.has(s.year) && <span className="badge gold plain mt">Você joga aqui</span>}
            </div>
          </a>
        );
      })}
    </div>
  );
}
