"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoArea, geoMercator, geoPath, type GeoPath } from "d3-geo";
import { select } from "d3-selection";
import "d3-transition";
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior } from "d3-zoom";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import type { CityDetail, MapCity, MapPayload } from "@/lib/city-view";
import { MAP_NONE, MAP_OTHERS } from "@/lib/map-colors";
import { UF_IBGE } from "@/lib/startpoints";
import { Select } from "./forms";
import { Icon } from "./Icon";

const W = 800;
const H = 800;
/** A partir deste zoom, os municípios aparecem. */
const CITY_ZOOM = 2.2;
const NONE = MAP_NONE;
const CODE_TO_UF: Record<string, string> = Object.fromEntries(Object.entries(UF_IBGE).map(([uf, c]) => [c, uf]));
const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco",
  PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

type Layer = "prefeitos" | "presidente" | "eleitorado";
type Bounds = [[number, number], [number, number]];
interface StateShape {
  uf: string;
  d: string;
  bounds: Bounds;
  cx: number;
  cy: number;
}
interface CityShape {
  id: string;
  d: string;
  bounds: Bounds;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;

/**
 * Algumas malhas trazem anéis com a orientação invertida; o d3 desenharia
 * "o mundo menos a cidade". Polígono com área maior que meia esfera é invertido.
 */
function fixWinding<T extends Feature<Geometry>>(f: T): T {
  const g = f.geometry;
  if (g.type === "Polygon") {
    if (geoArea(f) > 2 * Math.PI) g.coordinates.forEach((r) => r.reverse());
  } else if (g.type === "MultiPolygon") {
    for (const poly of g.coordinates) {
      if (geoArea({ type: "Polygon", coordinates: poly }) > 2 * Math.PI) poly.forEach((r) => r.reverse());
    }
  }
  return f;
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

export function CityMap({ data }: { data: MapPayload }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const pathRef = useRef<GeoPath | null>(null);
  const [states, setStates] = useState<StateShape[] | null>(null);
  const [cityShapes, setCityShapes] = useState<Record<string, CityShape[]>>({});
  const loading = useRef(new Set<string>());
  const [view, setView] = useState({ k: 1, x: 0, y: 0 });
  const [layer, setLayer] = useState<Layer>("prefeitos");
  const [hover, setHover] = useState<{ id: string; kind: "uf" | "city"; x: number; y: number } | null>(null);
  const [selUf, setSelUf] = useState<string | null>(null);
  const [selCity, setSelCity] = useState<string | null>(null);
  const [detail, setDetail] = useState<CityDetail | "loading" | { error: string } | null>(null);

  const byId = useMemo(() => new Map<string, MapCity>(data.cities.map((c) => [c[0], c])), [data.cities]);

  // ------------------------------------------------------------ cores
  const cityFill = useCallback(
    (c: MapCity | undefined): string => {
      if (!c) return NONE;
      if (layer === "prefeitos") return c[3] >= 0 ? data.parties[c[3]].mapColor : NONE;
      if (layer === "presidente") {
        if (c[4] < 0) return NONE;
        const share = c[4] / 10;
        const t = 0.3 + 0.7 * Math.min(1, Math.abs(share - 50) / 25);
        return mix("#ece6da", share >= 50 ? data.winner.color : data.rival.color, t);
      }
      const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, c[5])) - 3) / 4));
      return mix("#f4d58d", "#0b1f3a", t);
    },
    [layer, data],
  );

  /** Agregado por UF (visão nacional). */
  const ufAgg = useMemo(() => {
    const out: Record<string, { mayors: Map<number, number>; w: number; r: number; electorate: number; cities: number }> = {};
    for (const c of data.cities) {
      const a = (out[c[2]] ??= { mayors: new Map(), w: 0, r: 0, electorate: 0, cities: 0 });
      a.cities++;
      a.electorate += c[5];
      if (c[3] >= 0) a.mayors.set(c[3], (a.mayors.get(c[3]) ?? 0) + 1);
      if (c[4] >= 0) {
        a.w += (c[4] / 1000) * c[5];
        a.r += (1 - c[4] / 1000) * c[5];
      }
    }
    return out;
  }, [data.cities]);

  const stateFill = useCallback(
    (uf: string): string => {
      const a = ufAgg[uf];
      if (!a) return NONE;
      if (layer === "prefeitos") {
        const top = [...a.mayors.entries()].sort((x, y) => y[1] - x[1])[0];
        return top ? data.parties[top[0]].mapColor : NONE;
      }
      if (layer === "presidente") {
        const share = (a.w / (a.w + a.r || 1)) * 100;
        const t = 0.3 + 0.7 * Math.min(1, Math.abs(share - 50) / 25);
        return mix("#ece6da", share >= 50 ? data.winner.color : data.rival.color, t);
      }
      const t = Math.min(1, Math.max(0, (Math.log10(Math.max(1, a.electorate)) - 5) / 3));
      return mix("#f4d58d", "#0b1f3a", t);
    },
    [layer, ufAgg, data],
  );

  // ------------------------------------------------------------ malhas
  useEffect(() => {
    let alive = true;
    fetch("/geo/brasil-uf.json")
      .then((r) => r.json())
      .then((topo: Topology) => {
        if (!alive) return;
        const fc = feature(topo, topo.objects[Object.keys(topo.objects)[0]]) as unknown as FeatureCollection<Geometry, { uf: string }>;
        fc.features.forEach(fixWinding);
        const projection = geoMercator().fitExtent(
          [
            [12, 12],
            [W - 12, H - 12],
          ],
          fc,
        );
        const path = geoPath(projection);
        pathRef.current = path;
        setStates(
          fc.features.map((f) => {
            const [cx, cy] = path.centroid(f);
            return { uf: CODE_TO_UF[f.properties.uf] ?? f.properties.uf, d: path(f) ?? "", bounds: path.bounds(f) as Bounds, cx, cy };
          }),
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadUf = useCallback(async (uf: string) => {
    if (loading.current.has(uf) || !pathRef.current) return;
    loading.current.add(uf);
    const topo = (await fetch(`/geo/mun-${UF_IBGE[uf]}.json`).then((r) => r.json())) as Topology;
    const fc = feature(topo, topo.objects[Object.keys(topo.objects)[0]]) as unknown as FeatureCollection<Geometry, { id: string }>;
    const path = pathRef.current;
    const shapes = fc.features.map(fixWinding).map((f: Feature<Geometry, { id: string }>) => ({ id: String(f.properties.id), d: path(f) ?? "", bounds: path.bounds(f) as Bounds }));
    setCityShapes((prev) => ({ ...prev, [uf]: shapes }));
  }, []);

  // ------------------------------------------------------------ zoom
  useEffect(() => {
    if (!svgRef.current || !states) return;
    let raf = 0;
    const zb = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 120])
      .translateExtent([
        [0, 0],
        [W, H],
      ])
      .on("zoom", (ev) => {
        gRef.current?.setAttribute("transform", ev.transform.toString());
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => setView({ k: ev.transform.k, x: ev.transform.x, y: ev.transform.y }));
        setHover(null);
      });
    zoomRef.current = zb;
    select(svgRef.current).call(zb).on("dblclick.zoom", null);
    return () => {
      cancelAnimationFrame(raf);
      select(svgRef.current!).on(".zoom", null);
    };
  }, [states]);

  const zoomTo = useCallback((b: Bounds, minK = CITY_ZOOM, maxK = 60) => {
    if (!svgRef.current || !zoomRef.current) return;
    const [[x0, y0], [x1, y1]] = b;
    const k = Math.max(minK, Math.min(maxK, 0.85 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
    const t = zoomIdentity
      .translate(W / 2, H / 2)
      .scale(k)
      .translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    select(svgRef.current).transition().duration(700).call(zoomRef.current.transform, t);
  }, []);

  const zoomBy = (f: number) => svgRef.current && zoomRef.current && select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, f);
  const reset = () => {
    setSelUf(null);
    setSelCity(null);
    setDetail(null);
    if (svgRef.current && zoomRef.current) select(svgRef.current).transition().duration(600).call(zoomRef.current.transform, zoomIdentity);
  };

  // estados visíveis com zoom suficiente: carrega e desenha os municípios
  const visibleUfs = useMemo(() => {
    if (!states || view.k < CITY_ZOOM) return [] as string[];
    const x0 = -view.x / view.k;
    const y0 = -view.y / view.k;
    const x1 = (W - view.x) / view.k;
    const y1 = (H - view.y) / view.k;
    return states.filter((s) => s.bounds[1][0] >= x0 && s.bounds[0][0] <= x1 && s.bounds[1][1] >= y0 && s.bounds[0][1] <= y1).map((s) => s.uf);
  }, [states, view]);
  const visibleKey = visibleUfs.join(",");
  useEffect(() => {
    for (const uf of visibleUfs) void loadUf(uf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleKey, loadUf]);

  // ------------------------------------------------------------ seleção
  const openCity = useCallback(
    async (id: string, focus = false) => {
      const c = byId.get(id);
      if (!c) return;
      setSelCity(id);
      setSelUf(c[2]);
      setDetail("loading");
      if (focus) {
        await loadUf(c[2]);
      }
      try {
        const r = await fetch(`/api/mundo/${data.year}/cidade/${id}`);
        const json = await r.json();
        setDetail(r.ok ? (json as CityDetail) : { error: json.error ?? "Não foi possível carregar a cidade." });
      } catch {
        setDetail({ error: "Sem conexão. Tente de novo." });
      }
    },
    [byId, data.year, loadUf],
  );

  // centraliza a cidade escolhida pela busca quando a malha da UF chega
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingFocus) return;
    const c = byId.get(pendingFocus);
    const shape = c ? cityShapes[c[2]]?.find((s) => s.id === pendingFocus) : undefined;
    if (shape) {
      zoomTo(shape.bounds, 5, 12);
      setPendingFocus(null);
    }
  }, [pendingFocus, cityShapes, byId, zoomTo]);

  const focusCity = (id: string) => {
    void openCity(id, true);
    setPendingFocus(id);
  };

  // ------------------------------------------------------------ desenho
  const statePaths = useMemo(
    () =>
      states?.map((s) => (
        <path
          key={s.uf}
          d={s.d}
          className="cm-state-fill"
          fill={stateFill(s.uf)}
          onClick={() => {
            setSelUf(s.uf);
            setSelCity(null);
            setDetail(null);
            void loadUf(s.uf);
            zoomTo(s.bounds);
          }}
          onPointerMove={(e) => {
            const r = boxRef.current!.getBoundingClientRect();
            setHover({ id: s.uf, kind: "uf", x: e.clientX - r.left, y: e.clientY - r.top });
          }}
          onPointerLeave={() => setHover(null)}
        />
      )),
    [states, stateFill, loadUf, zoomTo],
  );

  const cityPaths = useMemo(
    () =>
      visibleUfs.flatMap((uf) =>
        (cityShapes[uf] ?? []).map((s) => (
          <path
            key={s.id}
            d={s.d}
            className="cm-city"
            fill={cityFill(byId.get(s.id))}
            onClick={() => void openCity(s.id)}
            onPointerMove={(e) => {
              const r = boxRef.current!.getBoundingClientRect();
              setHover({ id: s.id, kind: "city", x: e.clientX - r.left, y: e.clientY - r.top });
            }}
            onPointerLeave={() => setHover(null)}
          />
        )),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visibleKey, cityShapes, cityFill, byId, openCity],
  );

  const highlight = (id: string | null, cls: string) => {
    if (!id) return null;
    const c = byId.get(id);
    const s = c ? cityShapes[c[2]]?.find((x) => x.id === id) : undefined;
    return s && view.k >= CITY_ZOOM ? <path d={s.d} className={cls} /> : null;
  };

  // ------------------------------------------------------------ legenda e painel
  const scopeCities = selUf ? data.cities.filter((c) => c[2] === selUf) : data.cities;
  const mayorsByParty = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of scopeCities) if (c[3] >= 0) m.set(c[3], (m.get(c[3]) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [scopeCities]);
  const noMayor = scopeCities.filter((c) => c[3] < 0).length;
  const searchOptions = useMemo(
    () => [...data.cities].sort((a, b) => a[1].localeCompare(b[1], "pt-BR")).map((c) => ({ value: c[0], label: `${c[1]} (${c[2]})`, hint: c[0] === data.myCity ? "Sua cidade" : undefined })),
    [data.cities, data.myCity],
  );

  const tip = (() => {
    if (!hover) return null;
    if (hover.kind === "uf") {
      const a = ufAgg[hover.id];
      return (
        <>
          <div className="map-tip__head">
            <b>{UF_NAMES[hover.id] ?? hover.id}</b>
            <span>{hover.id}</span>
          </div>
          <div className="cm-tip-line">{a ? `${fmt(a.cities)} municípios · ${fmt(a.electorate)} eleitores` : ""}</div>
          <div className="cm-tip-hint">Clique para aproximar</div>
        </>
      );
    }
    const c = byId.get(hover.id);
    if (!c) return null;
    const party = c[3] >= 0 ? data.parties[c[3]] : null;
    return (
      <>
        <div className="map-tip__head">
          <b>{c[1]}</b>
          <span>{c[2]}</span>
        </div>
        {layer === "prefeitos" && (
          <div className="cm-tip-line">
            <i style={{ background: party?.mapColor ?? NONE }} /> Prefeitura: <b>{party?.acronym ?? "sem prefeito eleito"}</b>
          </div>
        )}
        {layer === "presidente" && c[4] >= 0 && (
          <div className="cm-tip-line">
            {data.winner.name} <b>{pct(c[4] / 10)}</b> · {data.rival.name} <b>{pct(100 - c[4] / 10)}</b>
          </div>
        )}
        <div className="cm-tip-line">{fmt(c[5])} eleitores</div>
      </>
    );
  })();

  return (
    <div className="cm">
      <div className="cm-main">
        <div className="cm-toolbar">
          <div className="cm-layers" role="tablist" aria-label="Camada do mapa">
            {(
              [
                ["prefeitos", "Prefeituras"],
                ["presidente", `2º turno ${data.year}`],
                ["eleitorado", "Eleitorado"],
              ] as Array<[Layer, string]>
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={layer === k} className={layer === k ? "on" : ""} onClick={() => setLayer(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="cm-search">
            <Select name="_cidade" label="Buscar cidade" options={searchOptions} placeholder="Digite o nome da cidade" onChange={(v) => v && focusCity(v)} />
          </div>
        </div>
        <div className="cm-canvas" ref={boxRef}>
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mapa do Brasil por estados e municípios">
            <g ref={gRef}>
              {statePaths}
              {cityPaths}
              {states?.map((s) => (
                <path key={`b-${s.uf}`} d={s.d} className={`cm-state-border${selUf === s.uf ? " on" : ""}`} />
              ))}
              {highlight(data.myCity, "cm-mine")}
              {highlight(selCity, "cm-selected")}
              {view.k < CITY_ZOOM &&
                states?.map((s) => (
                  <text key={`l-${s.uf}`} x={s.cx} y={s.cy} className="map-label" style={{ fontSize: 11 / view.k }}>
                    {s.uf}
                  </text>
                ))}
            </g>
          </svg>
          {!states && <div className="cm-loading">Carregando o mapa…</div>}
          {hover && tip && (
            <div className={`map-tip${hover.y < 150 ? " below" : ""}`} style={{ left: Math.max(120, Math.min(hover.x, (boxRef.current?.clientWidth ?? 600) - 120)), top: hover.y }}>
              {tip}
            </div>
          )}
          <div className="cm-zoom">
            <button onClick={() => zoomBy(1.6)} aria-label="Aproximar">
              <Icon name="plus" size={18} />
            </button>
            <button onClick={() => zoomBy(1 / 1.6)} aria-label="Afastar">
              <span aria-hidden="true" className="cm-minus" />
            </button>
            <button onClick={reset} aria-label="Ver o Brasil inteiro">
              <Icon name="globe" size={18} />
            </button>
            {data.myCity && (
              <button onClick={() => focusCity(data.myCity!)} aria-label="Ir para a minha cidade">
                <Icon name="pin" size={18} />
              </button>
            )}
          </div>
          <div className="cm-hint">{view.k < CITY_ZOOM ? "Clique num estado ou use a rolagem para aproximar e ver as cidades" : "Clique numa cidade para ver os detalhes"}</div>
        </div>
      </div>

      <aside className="cm-side">
        {selCity ? (
          <CityPanel detail={detail} year={data.year} colorOf={(id, fallback) => (id ? data.parties.find((p) => p.id === id)?.mapColor ?? fallback : fallback)} onClose={() => (setSelCity(null), setDetail(null))} />
        ) : (
          <div className="cm-card">
            <div className="label">{selUf ? UF_NAMES[selUf] : "Brasil"}</div>
            <h2 className="cm-title">
              {layer === "prefeitos" ? (selUf ? "Prefeituras do estado" : "Prefeituras do país") : layer === "presidente" ? `2º turno presidencial de ${data.year}` : "Eleitorado"}
            </h2>
            {selUf && data.states[selUf]?.governor && (
              <div className="cm-gov">
                Governo: <b>{data.states[selUf].governor!.name}</b>{" "}
                <span className="cm-chip" style={{ ["--c" as string]: data.states[selUf].governor!.color }}>
                  {data.states[selUf].governor!.party}
                </span>
              </div>
            )}
            <div className="cm-facts">
              <div>
                <b>{fmt(scopeCities.length)}</b>
                <span>municípios</span>
              </div>
              <div>
                <b>{fmt(scopeCities.reduce((s, c) => s + c[5], 0))}</b>
                <span>eleitores</span>
              </div>
            </div>
            {layer === "presidente" ? (
              <div className="cm-legend-grad">
                <div className="bar" style={{ background: `linear-gradient(90deg, ${data.rival.color}, #ece6da, ${data.winner.color})` }} />
                <div className="ends">
                  <span>{data.rival.name}</span>
                  <span>{data.winner.name}</span>
                </div>
                <p className="muted">Votos reais do 2º turno de {data.year} em cada cidade (TSE).</p>
              </div>
            ) : layer === "eleitorado" ? (
              <div className="cm-legend-grad">
                <div className="bar" style={{ background: "linear-gradient(90deg, #f4d58d, #0b1f3a)" }} />
                <div className="ends">
                  <span>1 mil</span>
                  <span>10 milhões</span>
                </div>
              </div>
            ) : (
              <div className="cm-bars">
                {mayorsByParty
                  .filter(([i]) => data.parties[i].mapColor !== MAP_OTHERS)
                  .map(([i, n]) => (
                    <div key={i} className="cm-bar">
                      <span className="cm-chip" style={{ ["--c" as string]: data.parties[i].mapColor }}>
                        {data.parties[i].acronym}
                      </span>
                      <span className="cm-track">
                        <span style={{ width: `${(n / mayorsByParty[0][1]) * 100}%`, background: data.parties[i].mapColor }} />
                      </span>
                      <span className="mono">{fmt(n)}</span>
                    </div>
                  ))}
                {(() => {
                  const others = mayorsByParty.filter(([i]) => data.parties[i].mapColor === MAP_OTHERS).reduce((s, [, n]) => s + n, 0);
                  return others > 0 ? (
                    <div className="cm-bar">
                      <span className="cm-chip" style={{ ["--c" as string]: MAP_OTHERS }}>
                        Outros
                      </span>
                      <span className="cm-track">
                        <span style={{ width: `${(others / mayorsByParty[0][1]) * 100}%`, background: MAP_OTHERS }} />
                      </span>
                      <span className="mono">{fmt(others)}</span>
                    </div>
                  ) : null;
                })()}
                {noMayor > 0 && <p className="muted">{fmt(noMayor)} sem prefeito eleito na data (eleição anulada ou pendente).</p>}
              </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

function CityPanel({
  detail,
  year,
  colorOf,
  onClose,
}: {
  detail: CityDetail | "loading" | { error: string } | null;
  year: number;
  colorOf: (partyId: string | null, fallback: string) => string;
  onClose: () => void;
}) {
  if (!detail || detail === "loading")
    return (
      <div className="cm-card">
        <div className="cm-skeleton" />
        <div className="cm-skeleton short" />
      </div>
    );
  if ("error" in detail)
    return (
      <div className="cm-card">
        <p>{detail.error}</p>
      </div>
    );
  const totalSeats = detail.council.reduce((s, c) => s + c.seats, 0);
  return (
    <div className="cm-card">
      <div className="row between">
        <div className="label">
          {detail.uf}
          {detail.capital ? " · capital" : ""}
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
          <Icon name="x" size={18} />
        </button>
      </div>
      <h2 className="cm-title">{detail.name}</h2>
      <div className="cm-facts">
        <div>
          <b>{fmt(detail.electorate)}</b>
          <span>eleitores</span>
        </div>
        <div>
          <b>{totalSeats || "—"}</b>
          <span>vereadores</span>
        </div>
      </div>

      <div className="cm-section">
        <div className="label">Prefeitura</div>
        {detail.mayor ? (
          <div className="cm-mayor" style={{ ["--c" as string]: colorOf(detail.mayor.partyId, detail.mayor.color) }}>
            <div>
              {detail.mayor.href ? <a href={detail.mayor.href}>{detail.mayor.name}</a> : <b>{detail.mayor.name}</b>}
              <span className="cm-chip" style={{ ["--c" as string]: colorOf(detail.mayor.partyId, detail.mayor.color) }}>
                {detail.mayor.partyLabel}
              </span>
            </div>
            <small>
              {!detail.mayor.simulated && detail.mayor.electedIn <= year - 2 ? `Dado real (TSE) · eleito(a) em ${detail.mayor.electedIn}` : `Eleito(a) em ${detail.mayor.electedIn} na simulação`}
            </small>
            {detail.replaced && (
              <small className="cm-note">
                {detail.replaced.name} ({detail.replaced.party}), eleito(a) para o cargo, {detail.replaced.reason}.
              </small>
            )}
          </div>
        ) : (
          <p className="muted">Sem prefeito eleito na data (eleição anulada ou pendente).</p>
        )}
        {detail.mayorElect && (
          <p className="cm-note">
            Eleito(a) para o próximo mandato: <b>{detail.mayorElect.name}</b> ({detail.mayorElect.partyLabel})
          </p>
        )}
      </div>

      {detail.council.length > 0 && (
        <div className="cm-section">
          <div className="label">Câmara municipal</div>
          <div className="cm-seats" aria-label="Cadeiras por partido">
            {detail.council.map((c) => (
              <span key={c.label} style={{ flex: c.seats, background: colorOf(c.partyId, c.color) }} title={`${c.label}: ${c.seats}`} />
            ))}
          </div>
          <div className="cm-seat-list">
            {detail.council.map((c) => (
              <span key={c.label} className="cm-chip" style={{ ["--c" as string]: colorOf(c.partyId, c.color) }}>
                {c.label} <b>{c.seats}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {detail.president.length > 0 && (
        <div className="cm-section">
          <div className="label">2º turno presidencial de {year} (real)</div>
          {detail.president.map((p) => (
            <div key={p.name} className="cm-bar">
              <span className="cm-bar-name">{p.name}</span>
              <span className="cm-track">
                <span style={{ width: `${p.pct}%`, background: p.color }} />
              </span>
              <span className="mono">{pct(p.pct)}</span>
            </div>
          ))}
        </div>
      )}

      {(detail.players.length > 0 || detail.locals.length > 0) && (
        <div className="cm-section">
          <div className="label">Quem faz política aqui</div>
          {detail.players.map((p) => (
            <a key={p.id} className="cm-person" href={`/jogo/${year}/pessoa/${p.id}`}>
              <b>{p.name}</b> <span className="badge sim plain">jogador(a)</span> <span className="muted">{p.party ?? "sem partido"}</span>
            </a>
          ))}
          {detail.locals.map((p) => (
            <a key={p.id} className="cm-person" href={`/jogo/${year}/pessoa/${p.id}`}>
              <b>{p.name}</b> <span className="muted">{p.party ?? ""} · {p.role}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
