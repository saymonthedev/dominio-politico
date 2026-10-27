import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialWorld } from "../src/bootstrap";
import type { CityBase } from "../src/geo";
import type { Snapshot } from "../src/snapshot";

const cache = new Map<number, Snapshot>();
export function snapshot(year = 2026): Snapshot {
  if (!cache.has(year)) cache.set(year, JSON.parse(readFileSync(resolve(__dirname, `../../../data/snapshot-${year}.json`), "utf8")));
  return cache.get(year)!;
}

const cityCache = new Map<number, CityBase[]>();
export function cities(year = 2026): CityBase[] {
  if (!cityCache.has(year)) cityCache.set(year, JSON.parse(readFileSync(resolve(__dirname, `../../../data/municipios-${year}.json`), "utf8")).municipalities);
  return cityCache.get(year)!;
}

export function freshWorld(seed = "teste", year = 2026) {
  return createInitialWorld(snapshot(year), { worldId: `w_${year}`, seed, startRealAt: "2026-10-27T00:00:00Z", cities: cities(year) });
}
