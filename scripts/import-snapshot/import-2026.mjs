#!/usr/bin/env node
/**
 * Importa o "snapshot histórico" de 26/10/2026 a partir de fontes oficiais:
 *  - TSE Resultados (JSON oficial de divulgação): eleições 2026, 1º e 2º turnos
 *  - TSE Dados Abertos (consulta_cand 2022 e 2024): senadores com mandato até 2031,
 *    prefeitos e câmaras das capitais (2025–2028)
 *  - Banco Central (SGS): Selic, IPCA 12m, câmbio, dívida bruta
 *
 * Minimização (LGPD): só nome de urna, partido, cargo, UF, ano de nascimento,
 * situação e votos. CPF, título de eleitor, e-mail, data completa de nascimento,
 * cor/raça, estado civil e instrução NÃO são importados.
 *
 * Uso: node scripts/import-snapshot/import-2026.mjs [--cache DIR]
 * Saída: data/snapshot-2026.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const args = process.argv.slice(2);
const cacheDir = resolve(args.includes("--cache") ? args[args.indexOf("--cache") + 1] : join(ROOT, ".cache/tse"));
mkdirSync(cacheDir, { recursive: true });

const RES = "https://resultados.tse.jus.br/oficial/ele2026";
const CAND = (y) => `https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_${y}.zip`;
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const CAPITALS = {
  AC: "RIO BRANCO", AL: "MACEIÓ", AP: "MACAPÁ", AM: "MANAUS", BA: "SALVADOR", CE: "FORTALEZA", ES: "VITÓRIA",
  GO: "GOIÂNIA", MA: "SÃO LUÍS", MT: "CUIABÁ", MS: "CAMPO GRANDE", MG: "BELO HORIZONTE", PA: "BELÉM", PB: "JOÃO PESSOA",
  PR: "CURITIBA", PE: "RECIFE", PI: "TERESINA", RJ: "RIO DE JANEIRO", RN: "NATAL", RS: "PORTO ALEGRE", RO: "PORTO VELHO",
  RR: "BOA VISTA", SC: "FLORIANÓPOLIS", SP: "SÃO PAULO", SE: "ARACAJU", TO: "PALMAS",
};

const sources = [];
function source(id, title, url, publisher, license = "Dados públicos oficiais") {
  if (!sources.find((s) => s.id === id)) {
    sources.push({ id, title, url, publisher, license, retrieved_on: new Date().toISOString().slice(0, 10) });
  }
  return id;
}

async function fetchJson(url, attempt = 1) {
  const cacheFile = join(cacheDir, "http", url.replace(/[^a-z0-9.]+/gi, "_"));
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return fetchJson(url, attempt + 1);
    }
    throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return fetchJson(url, attempt + 1);
    }
    throw new Error(`${res.status} ${url}`);
  }
  const data = await res.json();
  mkdirSync(join(cacheDir, "http"), { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(data));
  return data;
}

const num = (s) => Number(String(s ?? "0").replace(/\./g, "").replace(",", ".")) || 0;
const pct = (s) => Number(String(s ?? "0").replace(",", ".")) || 0;

const LOWER = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);
export function titleCase(s) {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

function birthYear(dt) {
  const m = /(\d{4})$/.exec(dt ?? "");
  return m ? Number(m[1]) : null;
}

/** Extrai uma disputa do JSON de resultados do TSE. */
function parseRace(json, { office, geo, round, keepAllCandidates }) {
  if (!json) return null;
  const carg = json.carg?.[0];
  if (!carg) return null;
  const candidates = [];
  const parties = [];
  for (const agr of carg.agr ?? []) {
    const seats = num(agr.vag);
    for (const par of agr.par ?? []) {
      parties.push({ number: num(par.n), acronym: par.sg, federation: par.nfed || null, votes: num(par.tvtn), agr: agr.n, agr_seats: seats });
      for (const c of par.cand ?? []) {
        const elected = c.e === "s";
        if (!keepAllCandidates && !elected) continue;
        candidates.push({
          sq: c.sqcand,
          name: titleCase(c.nmu),
          party: par.sg,
          party_number: num(par.n),
          birth_year: birthYear(c.dt),
          votes: num(c.vap),
          share: pct(c.pvap),
          elected,
          status: c.st,
          valid: c.dvt?.startsWith("Válido") ?? true,
        });
      }
    }
  }
  candidates.sort((a, b) => b.votes - a.votes);
  return {
    office,
    geo,
    round,
    electorate: num(json.e?.te),
    turnout: num(json.e?.c),
    valid: num(json.v?.vv),
    blank: num(json.v?.vb),
    null_votes: num(json.v?.tvn),
    quotient: num(carg.qe),
    candidates,
    parties,
    federations: (carg.fed ?? []).map((f) => ({ code: f.n, acronym: f.sg, name: f.nm, members: f.npar.map(Number) })),
    coalitions: keepAllCandidates
      ? (carg.agr ?? []).map((a) => ({ agr: a.n, name: titleCase(a.nm), type: a.tp, members: String(a.com ?? "").split("/").map((x) => x.trim()).filter(Boolean) }))
      : [],
  };
}

// --------------------------------------------------------------------------
// CSV do consulta_cand (latin1, ';', aspas)
// --------------------------------------------------------------------------
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function* readCsv(path) {
  const text = new TextDecoder("latin1").decode(readFileSync(path));
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cols = parseCsvLine(lines[i]);
    const row = {};
    header.forEach((h, j) => (row[h] = cols[j]));
    yield row;
  }
}

async function ensureCandZip(year) {
  const dir = join(cacheDir, `cand_${year}`);
  if (existsSync(dir) && readdirSync(dir).some((f) => f.endsWith("BRASIL.csv"))) return dir;
  const zip = join(cacheDir, `cand_${year}.zip`);
  if (!existsSync(zip)) {
    console.log(`baixando consulta_cand_${year}.zip …`);
    const res = await fetch(CAND(year));
    if (!res.ok) throw new Error(`${res.status} ${CAND(year)}`);
    writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  }
  mkdirSync(dir, { recursive: true });
  execFileSync("unzip", ["-o", "-q", zip, "-d", dir]);
  return dir;
}

// --------------------------------------------------------------------------
async function main() {
  const resSrc = source(
    "tse-resultados-2026",
    "Resultados oficiais das Eleições 2026 (divulgação)",
    "https://resultados.tse.jus.br/oficial/ele2026/",
    "Tribunal Superior Eleitoral",
  );
  source(
    "tse-noticia-reeleicao-2026",
    "Presidente do TSE anuncia reeleição de Lula e faz balanço do 2º turno das Eleições 2026",
    "https://www.tse.jus.br/comunicacao/noticias/2026/Outubro/presidente-do-tse-anuncia-reeleicao-de-lula-e-faz-balanco-do-2o-turno-das-eleicoes-2026",
    "Tribunal Superior Eleitoral",
  );

  const races = [];
  console.log("presidente…");
  for (const [el, round] of [["6257", 1], ["6258", 2]]) {
    const br = parseRace(await fetchJson(`${RES}/${el}/dados/br/br-c0001-e00${el}-u.json`), { office: "PRESIDENTE", geo: "BR", round, keepAllCandidates: true });
    if (br) races.push(br);
    for (const uf of UFS) {
      const r = parseRace(await fetchJson(`${RES}/${el}/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c0001-e00${el}-u.json`), { office: "PRESIDENTE", geo: uf, round, keepAllCandidates: true });
      if (r) races.push(r);
    }
  }

  const offices = [
    ["0003", "GOVERNADOR", true],
    ["0005", "SENADOR", true],
    ["0006", "DEP_FEDERAL", false],
    ["0007", "DEP_ESTADUAL", false],
    ["0008", "DEP_ESTADUAL", false],
  ];
  for (const uf of UFS) {
    console.log(`estaduais ${uf}…`);
    for (const [cd, office, all] of offices) {
      if (cd === "0007" && uf === "DF") continue;
      if (cd === "0008" && uf !== "DF") continue;
      const r = parseRace(await fetchJson(`${RES}/6259/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c${cd}-e006259-u.json`), { office, geo: uf, round: 1, keepAllCandidates: all });
      if (r) races.push(r);
    }
    const r2 = parseRace(await fetchJson(`${RES}/6260/dados/${uf.toLowerCase()}/${uf.toLowerCase()}-c0003-e006260-u.json`), { office: "GOVERNADOR", geo: uf, round: 2, keepAllCandidates: true });
    if (r2 && r2.candidates.length) races.push(r2);
  }

  // Partidos e federações a partir do próprio resultado
  const parties = new Map();
  const federations = new Map();
  for (const r of races) {
    for (const p of r.parties) {
      if (!parties.has(p.number)) parties.set(p.number, { number: p.number, acronym: p.acronym, name: "", federation: p.federation });
    }
    for (const f of r.federations) federations.set(f.code, f);
  }

  // Nomes completos dos partidos via consulta_cand 2026
  const candSrc = source(
    "tse-consulta-cand",
    "Candidatos — consulta_cand (2022, 2024, 2026)",
    "https://dadosabertos.tse.jus.br/dataset/?q=candidatos",
    "Tribunal Superior Eleitoral",
    "Creative Commons Attribution (CC-BY)",
  );
  const d2026 = await ensureCandZip(2026);
  for (const row of readCsv(join(d2026, "consulta_cand_2026_BRASIL.csv"))) {
    const n = Number(row.NR_PARTIDO);
    const p = parties.get(n) ?? { number: n, acronym: row.SG_PARTIDO, name: "", federation: null };
    if (!p.name) p.name = titleCase(row.NM_PARTIDO.replace(/\s+/g, " "));
    parties.set(n, p);
  }

  // Senadores eleitos em 2022 (mandato até fev/2031)
  console.log("senado 2022…");
  const d2022 = await ensureCandZip(2022);
  const senators2022 = [];
  let incumbentPresident = null;
  for (const row of readCsv(join(d2022, "consulta_cand_2022_BRASIL.csv"))) {
    if (row.DS_CARGO === "PRESIDENTE" && row.DS_SIT_TOT_TURNO === "ELEITO") {
      incumbentPresident = { sq: row.SQ_CANDIDATO, name: titleCase(row.NM_URNA_CANDIDATO), party: row.SG_PARTIDO, party_number: Number(row.NR_PARTIDO), birth_year: birthYear(row.DT_NASCIMENTO), note: null };
    }
    if (row.DS_CARGO === "SENADOR" && row.DS_SIT_TOT_TURNO === "ELEITO") {
      senators2022.push({ sq: row.SQ_CANDIDATO, name: titleCase(row.NM_URNA_CANDIDATO), party: row.SG_PARTIDO, party_number: Number(row.NR_PARTIDO), uf: row.SG_UF, birth_year: birthYear(row.DT_NASCIMENTO) });
    }
  }

  // Prefeitos e câmaras das capitais (eleições 2024)
  console.log("capitais 2024…");
  const d2024 = await ensureCandZip(2024);
  const municipal2024 = {};
  for (const uf of Object.keys(CAPITALS)) municipal2024[uf] = { capital: titleCase(CAPITALS[uf]), mayor: null, council: {} };
  for (const uf of Object.keys(CAPITALS)) {
    const file = join(d2024, `consulta_cand_2024_${uf}.csv`);
    if (!existsSync(file)) continue;
    for (const row of readCsv(file)) {
      if (row.NM_UE !== CAPITALS[uf]) continue;
      const elected = row.DS_SIT_TOT_TURNO?.startsWith("ELEITO");
      if (!elected) continue;
      if (row.DS_CARGO === "PREFEITO") {
        municipal2024[uf].mayor = { sq: row.SQ_CANDIDATO, name: titleCase(row.NM_URNA_CANDIDATO), party: row.SG_PARTIDO, party_number: Number(row.NR_PARTIDO), birth_year: birthYear(row.DT_NASCIMENTO) };
      } else if (row.DS_CARGO === "VEREADOR") {
        municipal2024[uf].council[row.SG_PARTIDO] = (municipal2024[uf].council[row.SG_PARTIDO] ?? 0) + 1;
      }
    }
  }

  // Banco Central — SGS
  console.log("economia (BCB)…");
  const bcbSrc = source("bcb-sgs", "Sistema Gerenciador de Séries Temporais", "https://www3.bcb.gov.br/sgspub/", "Banco Central do Brasil");
  const sgs = async (code) => {
    const d = await fetchJson(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados/ultimos/1?formato=json`);
    return d?.[0] ? { date: d[0].data, value: Number(d[0].valor) } : null;
  };
  const economy = {
    selic: await sgs(432),
    ipca_12m: await sgs(13522),
    ipca_month: await sgs(433),
    fx_usd: await sgs(1),
    debt_gdp: await sgs(13762),
    unemployment: await sgs(24369),
    source_id: bcbSrc,
  };
  source("ibge-contas-trimestrais", "Sistema de Contas Nacionais Trimestrais", "https://www.ibge.gov.br/estatisticas/todos-os-produtos-estatisticos/9300-contas-nacionais-trimestrais.html", "IBGE");

  const electorate = { BR: 0, uf: {} };
  for (const r of races) {
    if (r.office === "PRESIDENTE" && r.round === 1) {
      if (r.geo === "BR") electorate.BR = r.electorate;
      else electorate.uf[r.geo] = r.electorate;
    }
  }

  const out = {
    meta: {
      year: 2026,
      snapshot_date: "2026-10-26",
      generated_at: new Date().toISOString(),
      note: "Snapshot histórico real. Tudo o que acontecer depois desta data pertence à linha do tempo simulada.",
      minimization: "Importados apenas nome de urna, partido, cargo, UF, ano de nascimento, situação e votos.",
      result_source_id: resSrc,
      candidates_source_id: candSrc,
    },
    sources,
    electorate,
    parties: [...parties.values()].sort((a, b) => a.number - b.number),
    federations: [...federations.values()],
    races,
    senatorsContinuing: senators2022,
    municipalCapitals: municipal2024,
    incumbentPresident,
    economy: { ...economy, gdp_growth: 2.0, gdp_level: 3.4257 },
  };
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, "data/snapshot-2026.json"), JSON.stringify(out));
  console.log(`ok: ${races.length} disputas, ${parties.size} partidos, ${senators2022.length} senadores 2022`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
