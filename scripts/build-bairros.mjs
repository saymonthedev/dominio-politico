#!/usr/bin/env node
/**
 * Gera data/bairros.json a partir do Censo 2022 (IBGE), agregados por bairro e por distrito:
 * população e rendimento nominal médio mensal da pessoa responsável pelo domicílio.
 *
 * Uso: node scripts/build-bairros.mjs <pasta com os CSVs do IBGE>
 *   Agregados_por_bairros_basico_BR.csv
 *   Agregados_por_bairros_renda_responsavel_BR.csv
 *   Agregados_por_distritos_basico_BR.csv
 *   Agregados_por_distritos_renda_responsavel_BR.csv
 *   Agregados_por_municipios_renda_responsavel_BR.csv
 * (ftp.ibge.gov.br/Censos/Censo_Demografico_2022/Agregados_por_Setores_Censitarios
 *  e .../Agregados_por_Setores_Censitarios_Rendimento_do_Responsavel)
 *
 * Saída: para cada município, a renda média, o número de domicílios e a lista de
 * bairros oficiais (895 cidades) ou, onde não há bairros oficiais, os distritos.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Informe a pasta com os CSVs do IBGE.");
  process.exit(1);
}

/** CSV do IBGE: separado por ";", campos entre aspas, Latin-1. */
function readCsv(name) {
  const text = new TextDecoder("latin1").decode(readFileSync(join(dir, name)));
  const lines = text.split(/\r?\n/).filter(Boolean);
  const split = (line) => {
    const out = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === ";" && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/** "4053,67" → 4053.67; "X", "." e vazio → null (dado suprimido pelo IBGE). */
const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/\./g, (m, i, all) => (all.includes(",") ? "" : m)).replace(",", ".");
  const n = Number(s);
  return s && Number.isFinite(n) ? n : null;
};

/** Nomes em maiúsculas viram "Título" (preposições minúsculas); os demais ficam como estão. */
function tidy(name) {
  const n = name.trim().replace(/\s+/g, " ");
  if (n !== n.toUpperCase()) return n;
  const small = new Set(["da", "de", "do", "das", "dos", "e"]);
  return n
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

const munIncome = new Map();
for (const r of readCsv("Agregados_por_municipios_renda_responsavel_BR.csv")) {
  munIncome.set(r.CD_MUN, { r: num(r.V06004), n: num(r.V06001) });
}

function collect(basicFile, incomeFile, codeKey, nameKey) {
  const income = new Map(readCsv(incomeFile).map((r) => [r[codeKey], num(r.V06004)]));
  const byMun = new Map();
  for (const r of readCsv(basicFile)) {
    const pop = num(r.v0001) ?? 0;
    if (pop <= 0) continue;
    const list = byMun.get(r.CD_MUN) ?? [];
    list.push({ name: tidy(r[nameKey]), pop: Math.round(pop), income: income.get(r[codeKey]) ?? null, mun: r.NM_MUN });
    byMun.set(r.CD_MUN, list);
  }
  return byMun;
}

const bairros = collect("Agregados_por_bairros_basico_BR.csv", "Agregados_por_bairros_renda_responsavel_BR.csv", "CD_BAIRRO", "NM_BAIRRO");
const distritos = collect("Agregados_por_distritos_basico_BR.csv", "Agregados_por_distritos_renda_responsavel_BR.csv", "CD_DIST", "NM_DIST");

/**
 * O Distrito Federal não tem bairros nem distritos no Censo: as referências do dia a dia são as
 * regiões administrativas. População e renda relativa à média do DF aproximadas da PDAD 2021
 * (Codeplan/IPEDF); o valor absoluto da renda vem do Censo 2022 (média do DF).
 */
const DF_RAS = [
  ["Plano Piloto", 225000, 2.3], ["Lago Sul", 29000, 3.2], ["Lago Norte", 37000, 2.4], ["Sudoeste/Octogonal", 55000, 2.4], ["Park Way", 23000, 2.0],
  ["Jardim Botânico", 27000, 2.0], ["Águas Claras", 120000, 1.6], ["Cruzeiro", 31000, 1.3], ["Guará", 142000, 1.2], ["Vicente Pires", 66000, 1.0],
  ["Arniqueira", 47000, 1.0], ["Núcleo Bandeirante", 24000, 0.95], ["Taguatinga", 210000, 0.9], ["Sobradinho", 64000, 0.85], ["Candangolândia", 16000, 0.65],
  ["Riacho Fundo", 43000, 0.65], ["Gama", 137000, 0.65], ["Sobradinho II", 80000, 0.6], ["Riacho Fundo II", 72000, 0.5], ["Ceilândia", 350000, 0.5],
  ["Brazlândia", 55000, 0.45], ["Samambaia", 247000, 0.45], ["São Sebastião", 118000, 0.45], ["Santa Maria", 129000, 0.45], ["Planaltina", 186000, 0.42],
  ["Recanto das Emas", 133000, 0.42], ["Paranoá", 69000, 0.42], ["Itapoã", 66000, 0.35], ["Varjão", 9000, 0.35], ["Fercal", 9000, 0.33],
  ["SCIA/Estrutural", 37000, 0.3], ["Sol Nascente/Pôr do Sol", 93000, 0.3],
];

/** "da Barra" → "Bairro da Barra" (é assim que se fala nas cidades onde o nome oficial começa com preposição). */
const bairroName = (n) => (/^(da|de|do|das|dos) /.test(n) ? `Bairro ${n}` : n.charAt(0).toUpperCase() + n.slice(1));

const out = {};
let nb = 0;
let nd = 0;
for (const [mun, info] of munIncome) {
  const base = Math.round(info.r ?? 0);
  if (mun === "5300108") {
    out[mun] = { r: base, n: Math.round(info.n ?? 0), t: "b", b: DF_RAS.map(([name, pop, k]) => [name, pop, Math.round(base * k)]).sort((a, b) => a[0].localeCompare(b[0], "pt-BR")) };
    nb += DF_RAS.length;
    continue;
  }
  const fromB = bairros.get(mun);
  const list = fromB?.length ? fromB : distritos.get(mun) ?? [];
  const kind = fromB?.length ? "b" : "d";
  // nomes repetidos (o IBGE separa bairros homônimos por distrito): soma a população
  const merged = new Map();
  for (const x of list) {
    // cidades grandes divididas em muitos distritos (São Paulo) usam o nome puro, como se fala lá
    const label = kind === "d" ? (list.length > 8 ? x.name : x.name === x.mun ? `Sede de ${x.name}` : `Distrito de ${x.name}`) : bairroName(x.name);
    const prev = merged.get(label);
    if (!prev) merged.set(label, { ...x, name: label });
    else {
      const pop = prev.pop + x.pop;
      prev.income = prev.income != null && x.income != null ? (prev.income * prev.pop + x.income * x.pop) / pop : prev.income ?? x.income;
      prev.pop = pop;
    }
  }
  const rows = [...merged.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
    .map((x) => [x.name, x.pop, Math.round(x.income ?? base)]);
  if (kind === "b") nb += rows.length;
  else nd += rows.length;
  out[mun] = { r: base, n: Math.round(info.n ?? 0), t: kind, b: rows };
}

const file = join(process.cwd(), "data", "bairros.json");
writeFileSync(file, JSON.stringify({ fonte: "IBGE, Censo Demográfico 2022: agregados por bairro e por distrito (população e rendimento médio da pessoa responsável pelo domicílio)", m: out }));
console.log(`municípios: ${Object.keys(out).length} · bairros: ${nb} · distritos: ${nd} → ${file}`);
