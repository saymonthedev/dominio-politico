/**
 * Gera apps/web/lib/startpoints.ts a partir de data/snapshot-*.json:
 * os fatos reais (TSE/BCB) de cada ponto de partida, incluindo o 2º turno por UF.
 * Uso: node scripts/build-startpoints.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const YEARS = [2002, 2006, 2010, 2014, 2018, 2022, 2026];
const UF_IBGE = { RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17", MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29", MG: "31", ES: "32", RJ: "33", SP: "35", PR: "41", SC: "42", RS: "43", MS: "50", MT: "51", GO: "52", DF: "53" };
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

const points = YEARS.map((year) => {
  const s = JSON.parse(readFileSync(new URL(`../data/snapshot-${year}.json`, import.meta.url)));
  const pres = (geo) => s.races.find((r) => r.office === "PRESIDENTE" && r.geo === geo && r.round === 2);
  const br = pres("BR");
  const [w, r] = [...br.candidates].sort((a, b) => b.votes - a.votes);
  const total = w.votes + r.votes;
  const ufResults = {};
  for (const uf of Object.keys(UF_IBGE).sort()) {
    const race = pres(uf);
    if (!race) continue;
    const [a, b] = [...race.candidates].sort((x, y) => y.votes - x.votes);
    ufResults[uf] = { party: a.party, name: a.name, share: round1((a.votes / (a.votes + b.votes)) * 100) };
  }
  return {
    year,
    date: s.meta.snapshot_date,
    winner: w.name,
    winnerParty: w.party,
    winnerShare: round2((w.votes / total) * 100),
    rival: r.name,
    rivalParty: r.party,
    rivalShare: round2((r.votes / total) * 100),
    incumbent: s.incumbentPresident?.name ?? w.name,
    electorate: s.electorate.BR,
    parties: s.parties.length,
    selic: s.economy.selic?.value ?? null,
    ipca: s.economy.ipca_12m?.value ?? null,
    ufResults,
  };
});

const out = `/** Gerado por scripts/build-startpoints.mjs a partir de data/snapshot-*.json (TSE/BCB). Não edite à mão. */
export const START_POINTS = ${JSON.stringify(points)} as const;

export type StartPoint = (typeof START_POINTS)[number];

export const UF_IBGE: Record<string, string> = ${JSON.stringify(UF_IBGE)};
`;
writeFileSync(new URL("../apps/web/lib/startpoints.ts", import.meta.url), out);
for (const p of points) console.log(p.year, p.winner, p.winnerShare, "×", p.rival, p.rivalShare, "eleitorado", p.electorate, "UFs", Object.keys(p.ufResults).length);
