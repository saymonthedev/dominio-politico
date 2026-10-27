import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInitialWorld } from "../src/bootstrap";
import type { Snapshot } from "../src/snapshot";

const cache = new Map<number, Snapshot>();
export function snapshot(year = 2026): Snapshot {
  if (!cache.has(year)) cache.set(year, JSON.parse(readFileSync(resolve(__dirname, `../../../data/snapshot-${year}.json`), "utf8")));
  return cache.get(year)!;
}

export function freshWorld(seed = "teste", year = 2026) {
  return createInitialWorld(snapshot(year), { worldId: `w_${year}`, seed, startRealAt: "2026-10-27T00:00:00Z" });
}
