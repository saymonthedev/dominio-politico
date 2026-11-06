import { profileFor } from "@dp/engine";
import { fmtMonthYear } from "@/lib/format";
import { START_POINTS } from "@/lib/startpoints";
import { AuthLink } from "./AuthAware";

const pct = (v: number) => v.toFixed(2).replace(".", ",");

/**
 * Linha do tempo dos pontos de partida (2º turno presidencial real de cada ano). Com `authHrefFor`,
 * quem já entrou vai para outro destino (decidido no navegador: a página pública fica estática).
 */
export function StartTrack({
  hrefFor,
  authHrefFor,
  taken = new Set(),
  sharedDates,
}: {
  hrefFor: (year: number) => string;
  authHrefFor?: (year: number) => string;
  taken?: Set<number>;
  /** data de hoje dos mundos compartilhados que já andaram (ano → data) */
  sharedDates?: Record<number, string>;
}) {
  return (
    <div className="track">
      {START_POINTS.map((s) => {
        const wc = profileFor(s.winnerParty, s.year).color;
        const rc = profileFor(s.rivalParty, s.year).color;
        const card = (
          <>
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
              {sharedDates?.[s.year] && <div className="track__now">Compartilhado já em {fmtMonthYear(sharedDates[s.year])}</div>}
              {taken.has(s.year) && <span className="badge gold plain mt">Você joga aqui</span>}
            </div>
          </>
        );
        return authHrefFor ? (
          <AuthLink key={s.year} href={hrefFor(s.year)} authHref={authHrefFor(s.year)}>
            {card}
          </AuthLink>
        ) : (
          <a key={s.year} href={hrefFor(s.year)} className={taken.has(s.year) ? "taken" : undefined}>
            {card}
          </a>
        );
      })}
    </div>
  );
}
