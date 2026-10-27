"use client";
import { useState } from "react";
import type { UfPath } from "@/lib/geo-paths";

export interface MapYear {
  year: number;
  winner: string;
  winnerParty: string;
  rival: string;
  rivalParty: string;
  colors: Record<string, string>;
  ufResults: Record<string, { party: string; name: string; share: number }>;
}

/** Mapa real do Brasil: quem venceu o 2º turno presidencial em cada estado (TSE). */
export function ElectionMap({ paths, years, initial }: { paths: UfPath[]; years: MapYear[]; initial: number }) {
  const [year, setYear] = useState(initial);
  const [hover, setHover] = useState<string | null>(null);
  const data = years.find((y) => y.year === year) ?? years[years.length - 1];
  const h = hover ? data.ufResults[hover] : null;
  return (
    <figure className="election-map">
      <div className="map-years" role="tablist" aria-label="Eleição">
        {years.map((y) => (
          <button key={y.year} role="tab" aria-selected={y.year === year} className={y.year === year ? "on" : ""} onClick={() => setYear(y.year)}>
            {y.year}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 600 620" role="img" aria-label={`Mapa do 2º turno presidencial de ${year} por estado`}>
        {paths.map((p) => {
          const r = data.ufResults[p.uf];
          const intensity = r ? Math.min(1, 0.55 + (r.share - 50) / 40) : 0.3;
          return (
            <path
              key={p.uf}
              d={p.d}
              fill={r ? data.colors[r.party] ?? "#64748b" : "#64748b"}
              fillOpacity={intensity}
              stroke="#0b1f3a"
              strokeWidth={hover === p.uf ? 2.2 : 0.8}
              onMouseEnter={() => setHover(p.uf)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{r ? `${p.uf}: ${r.name} ${r.share.toFixed(1).replace(".", ",")}%` : p.uf}</title>
            </path>
          );
        })}
        {paths.map((p) => (
          <text key={`t-${p.uf}`} x={p.cx} y={p.cy} className="map-label">
            {p.uf}
          </text>
        ))}
      </svg>
      <figcaption>
        <div className="row" style={{ gap: 14 }}>
          <span className="legend"><i style={{ background: data.colors[data.winnerParty] }} /> {data.winner} ({data.winnerParty})</span>
          <span className="legend"><i style={{ background: data.colors[data.rivalParty] }} /> {data.rival} ({data.rivalParty})</span>
        </div>
        <div className="map-hint">
          {h ? (
            <>
              <b>{hover}</b> · {h.name} venceu com <b className="mono">{h.share.toFixed(1).replace(".", ",")}%</b>
            </>
          ) : (
            <>2º turno presidencial por estado · fonte TSE · passe o mouse</>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
