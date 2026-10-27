/**
 * Snapshots reais (TSE, BCB, IBGE) de cada ponto de partida.
 * Gerados por scripts/import-snapshot/*. Importações estáticas para que o
 * bundler inclua os arquivos nas funções serverless.
 */
import type { Snapshot } from "@dp/engine";

const loaders: Record<number, () => Promise<{ default: unknown }>> = {
  2002: () => import("../../data/snapshot-2002.json"),
  2006: () => import("../../data/snapshot-2006.json"),
  2010: () => import("../../data/snapshot-2010.json"),
  2014: () => import("../../data/snapshot-2014.json"),
  2018: () => import("../../data/snapshot-2018.json"),
  2022: () => import("../../data/snapshot-2022.json"),
  2026: () => import("../../data/snapshot-2026.json"),
};

export async function loadSnapshot(year: number): Promise<Snapshot> {
  const loader = loaders[year];
  if (!loader) throw new Error(`Não há snapshot para ${year}`);
  return (await loader()).default as Snapshot;
}
