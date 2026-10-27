import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import ufTopo from "@/public/geo/brasil-uf.json";
import { UF_IBGE } from "./startpoints";

const CODE_TO_UF = Object.fromEntries(Object.entries(UF_IBGE).map(([uf, code]) => [code, uf]));

export interface UfPath {
  uf: string;
  d: string;
  cx: number;
  cy: number;
}

/** Caminhos SVG dos 27 estados (malha derivada do IBGE), projetados para uma caixa width×height. */
export function brazilUfPaths(width = 600, height = 620): UfPath[] {
  const topo = ufTopo as unknown as Topology;
  const key = Object.keys(topo.objects)[0];
  const fc = feature(topo, topo.objects[key]) as unknown as FeatureCollection<Geometry, { uf: string }>;
  const projection = geoMercator().fitSize([width, height], fc);
  const path = geoPath(projection);
  return fc.features.map((f) => {
    const [cx, cy] = path.centroid(f);
    return { uf: CODE_TO_UF[f.properties.uf] ?? f.properties.uf, d: path(f) ?? "", cx, cy };
  });
}
