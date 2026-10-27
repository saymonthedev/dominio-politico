/** Utilitários comuns para ler os Dados Abertos do TSE (zips com CSV em latin1). */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
export const CACHE = join(ROOT, ".cache/tse");
const ZIPS = join(CACHE, "zips");
const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

const LOWER = new Set(["da", "de", "do", "das", "dos", "e", "d'"]);
export const titleCase = (s) =>
  (s ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");

/** Eleito: "ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA" ou, em anos antigos, "MÉDIA". */
export const isElected = (st) => /^(ELEITO|M[ÉE]DIA)/.test(st ?? "");

export const birthYear = (d) => {
  const m = /(\d{4})$/.exec(d ?? "");
  return m ? Number(m[1]) : null;
};

export function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

export async function ensureZip(name, path) {
  const f = join(ZIPS, name);
  if (existsSync(f)) return f;
  mkdirSync(ZIPS, { recursive: true });
  console.log(`baixando ${name}…`);
  const res = await fetch(`${BASE}/${path}/${name}`);
  if (!res.ok) throw new Error(`${res.status} ${name}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}

/** Arquivos CSV de um zip; prefere o nacional (BRASIL), que já contém todas as UFs. */
export function nationalCsv(zip) {
  const list = spawnSync("unzip", ["-Z1", zip], { encoding: "utf8" }).stdout.split("\n");
  const br = list.find((f) => /_BRASIL\.csv$/i.test(f));
  return br ?? "*.csv";
}

/** Lê um CSV (latin1) de dentro de um zip, linha a linha. */
export async function eachRow(zip, pattern, onRow) {
  const proc = spawn("unzip", ["-p", zip, pattern]);
  const rl = createInterface({ input: proc.stdout.setEncoding("latin1"), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (line.startsWith('"DT_GERACAO"')) {
      header = parseCsvLine(line);
      continue;
    }
    if (!header) continue;
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i];
    onRow(row);
  }
}

/** GET com cache em disco e novas tentativas. */
export async function fetchJsonCached(url, attempt = 1) {
  const file = join(CACHE, "http", url.replace(/[^a-z0-9.]+/gi, "_"));
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (e) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return fetchJsonCached(url, attempt + 1);
    }
    throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return fetchJsonCached(url, attempt + 1);
    }
    throw new Error(`${res.status} ${url}`);
  }
  const data = await res.json();
  mkdirSync(join(CACHE, "http"), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
  return data;
}
