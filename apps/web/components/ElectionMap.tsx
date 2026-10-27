"use client";
import { useRef, useState } from "react";
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

const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/** Mapa real do Brasil: quem venceu o 2º turno presidencial em cada estado (TSE). */
export function ElectionMap({ paths, years, initial, ufNames }: { paths: UfPath[]; years: MapYear[]; initial: number; ufNames: Record<string, string> }) {
  const [year, setYear] = useState(initial);
  const [hover, setHover] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const data = years.find((y) => y.year === year) ?? years[years.length - 1];
  const h = hover ? data.ufResults[hover] : null;
  const sides = h
    ? [
        { name: h.name, party: h.party, share: h.share },
        h.name === data.winner
          ? { name: data.rival, party: data.rivalParty, share: 100 - h.share }
          : { name: data.winner, party: data.winnerParty, share: 100 - h.share },
      ]
    : [];
  const move = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top });
  };
  return (
    <figure className="election-map">
      <div className="map-years" role="tablist" aria-label="Eleição">
        {years.map((y) => (
          <button key={y.year} role="tab" aria-selected={y.year === year} className={y.year === year ? "on" : ""} onClick={() => setYear(y.year)}>
            {y.year}
          </button>
        ))}
      </div>
      <div className="map-canvas" ref={box} onPointerLeave={() => { setHover(null); setTip(null); }}>
        <svg viewBox="0 0 600 620" role="img" aria-label={`Mapa do 2º turno presidencial de ${year} por estado`}>
          {paths.map((p) => {
            const r = data.ufResults[p.uf];
            const intensity = r ? Math.min(1, 0.55 + (r.share - 50) / 40) : 0.3;
            return (
              <path
                key={p.uf}
                d={p.d}
                fill={r ? data.colors[r.party] ?? "#64748b" : "#64748b"}
                fillOpacity={hover && hover !== p.uf ? intensity * 0.55 : intensity}
                stroke={hover === p.uf ? "#f4d58d" : "#0b1f3a"}
                strokeWidth={hover === p.uf ? 2.4 : 0.8}
                tabIndex={0}
                aria-label={r ? `${ufNames[p.uf] ?? p.uf}: ${r.name} venceu com ${pct(r.share)}` : ufNames[p.uf] ?? p.uf}
                onPointerEnter={(e) => { setHover(p.uf); move(e); }}
                onPointerMove={move}
                onFocus={() => { setHover(p.uf); setTip({ x: p.cx, y: p.cy }); }}
                onBlur={() => setHover(null)}
              />
            );
          })}
          {paths.map((p) => (
            <text key={`t-${p.uf}`} x={p.cx} y={p.cy} className="map-label">
              {p.uf}
            </text>
          ))}
        </svg>
        {h && hover && tip && (() => {
          const left = Math.max(120, Math.min(tip.x, (box.current?.clientWidth ?? 600) - 120));
          return (
          <div className={`map-tip${tip.y < 150 ? " below" : ""}`} style={{ left, top: tip.y, ["--arrow" as string]: `${tip.x - left}px` }} role="status">
            <div className="map-tip__head">
              <b>{ufNames[hover] ?? hover}</b>
              <span>{hover}</span>
            </div>
            {sides.map((s, i) => (
              <div key={s.name} className={`map-tip__row${i === 0 ? " win" : ""}`}>
                <i style={{ background: data.colors[s.party] ?? "#64748b" }} />
                <span className="n">
                  {s.name} <small>{s.party}</small>
                </span>
                <span className="v">{pct(s.share)}</span>
                <span className="bar">
                  <span style={{ width: `${s.share}%`, background: data.colors[s.party] ?? "#64748b" }} />
                </span>
              </div>
            ))}
          </div>
          );
        })()}
      </div>
      <figcaption>
        <div className="row" style={{ gap: 14 }}>
          <span className="legend"><i style={{ background: data.colors[data.winnerParty] }} /> {data.winner} ({data.winnerParty})</span>
          <span className="legend"><i style={{ background: data.colors[data.rivalParty] }} /> {data.rival} ({data.rivalParty})</span>
        </div>
        <div className="map-hint">2º turno presidencial de {year} por estado · fonte TSE · passe o mouse sobre um estado</div>
      </figcaption>
    </figure>
  );
}
