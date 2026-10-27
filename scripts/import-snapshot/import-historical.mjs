#!/usr/bin/env node
/**
 * Importa o snapshot real do dia seguinte ao 2º turno presidencial de um ano
 * (2002, 2006, 2010, 2014, 2018 ou 2022) a partir do Portal de Dados Abertos do TSE:
 *  - votacao_candidato_munzona_<ano>: votos por candidato (agregados por UF)
 *  - detalhe_votacao_munzona_<ano>: eleitorado apto, comparecimento, brancos e nulos
 *  - consulta_cand_<ano>, <ano-2> e <ano-4>: nomes de urna, partidos, coligações,
 *    senadores com mandato em curso, prefeitos e câmaras das capitais
 *  - Banco Central (SGS): indicadores na data do snapshot
 *
 * Minimização (LGPD): só nome de urna, partido, cargo, UF, ano de nascimento,
 * situação e votos. CPF, título, e-mail e demais dados pessoais não são lidos.
 *
 * Uso: node scripts/import-snapshot/import-historical.mjs --year 2002
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../..");
const args = process.argv.slice(2);
const YEAR = Number(args[args.indexOf("--year") + 1]);
if (![2002, 2006, 2010, 2014, 2018, 2022].includes(YEAR)) {
  console.error("Use --year com 2002, 2006, 2010, 2014, 2018 ou 2022 (2026 usa import-2026.mjs)");
  process.exit(1);
}
const ZIPS = join(ROOT, ".cache/tse/zips");
const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const CAPITALS = {
  AC: "RIO BRANCO", AL: "MACEIO", AP: "MACAPA", AM: "MANAUS", BA: "SALVADOR", CE: "FORTALEZA", ES: "VITORIA",
  GO: "GOIANIA", MA: "SAO LUIS", MT: "CUIABA", MS: "CAMPO GRANDE", MG: "BELO HORIZONTE", PA: "BELEM", PB: "JOAO PESSOA",
  PR: "CURITIBA", PE: "RECIFE", PI: "TERESINA", RJ: "RIO DE JANEIRO", RN: "NATAL", RS: "PORTO ALEGRE", RO: "PORTO VELHO",
  RR: "BOA VISTA", SC: "FLORIANOPOLIS", SP: "SAO PAULO", SE: "ARACAJU", TO: "PALMAS",
};
/** Datas do 2º turno presidencial (o snapshot é o dia seguinte). */
const RUNOFF = { 2002: "2002-10-27", 2006: "2006-10-29", 2010: "2010-10-31", 2014: "2014-10-26", 2018: "2018-10-28", 2022: "2022-10-30" };
/** Crescimento anual do PIB no ano (IBGE, Contas Nacionais) e PIB trimestral nominal aproximado (R$ tri). */
const GDP = { 2002: [3.1, 0.38], 2006: [4.0, 0.6], 2010: [7.5, 0.97], 2014: [0.5, 1.45], 2018: [1.8, 1.75], 2022: [3.0, 2.5] };
/** Quem exercia a Presidência na data do snapshot, quando difere do eleito 4 anos antes. */
const INCUMBENT_OVERRIDE = { 2018: { cargo: "VICE-PRESIDENTE", note: "Assumiu a Presidência em 2016 após o impeachment da titular." } };
/** Nome de urna de quem exercia a Presidência (alguns anos não trazem a totalização no consulta_cand). */
const INCUMBENT_NAME = { 2002: "FERNANDO HENRIQUE", 2006: "LULA", 2010: "LULA", 2014: "DILMA", 2018: "MICHEL TEMER", 2022: "JAIR BOLSONARO" };
const CARGO = { 1: "PRESIDENTE", 3: "GOVERNADOR", 5: "SENADOR", 6: "DEP_FEDERAL", 7: "DEP_ESTADUAL", 8: "DEP_ESTADUAL" };

const strip = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
const LOWER = new Set(["de", "da", "do", "das", "dos", "e", "di", "du"]);
const titleCase = (s) => (s ?? "").toLowerCase().split(/\s+/).map((w, i) => (i > 0 && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
/** Eleito: "ELEITO", "ELEITO POR QP", "ELEITO POR MÉDIA" ou, em anos antigos, "MÉDIA". */
const isElected = (st) => /^(ELEITO|M[ÉE]DIA)/.test(st ?? "");
/** SQ_CANDIDATO só é único por UF em anos antigos: o id inclui ano e UF. */
const uid = (uf, sq) => `${YEAR}-${uf}-${sq}`;
/** Desemprego de referência (IBGE/PME) quando a série do SGS não cobre a data. */
const UNEMPLOYMENT_FALLBACK = { 2002: 11.2, 2006: 10.0, 2010: 6.1 };
const birthYear = (dt) => { const m = /(\d{4})$/.exec(dt ?? ""); return m ? Number(m[1]) : null; };

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

async function ensureZip(name, path) {
  const f = join(ZIPS, name);
  if (existsSync(f)) return f;
  mkdirSync(ZIPS, { recursive: true });
  console.log(`baixando ${name}…`);
  const res = await fetch(`${BASE}/${path}/${name}`);
  if (!res.ok) throw new Error(`${res.status} ${name}`);
  writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}

/** Lê CSVs (latin1) de dentro de um zip, linha a linha, filtrando por padrão de arquivo. */
async function eachRow(zip, pattern, onRow) {
  const proc = spawn("unzip", ["-p", zip, pattern]);
  const rl = createInterface({ input: proc.stdout.setEncoding("latin1"), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    if (line.startsWith('"DT_GERACAO"')) { header = parseCsvLine(line); continue; }
    if (!header) continue;
    const cols = parseCsvLine(line);
    const row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cols[i];
    onRow(row);
  }
}

async function sgsAt(code, isoDate, days = 400) {
  const [y, m, d] = isoDate.split("-");
  const start = new Date(Date.parse(`${isoDate}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10).split("-");
  const from = `${start[2]}/${start[1]}/${start[0]}`;
  const to = `${d}/${m}/${y}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${from}&dataFinal=${to}`, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      const data = await res.json();
      const last = data[data.length - 1];
      return last ? { date: last.data, value: Number(last.valor) } : null;
    } catch {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return null;
}

async function main() {
  const sources = [
    { id: `tse-votacao-${YEAR}`, title: `Votação nominal por município e zona — ${YEAR}`, url: `${BASE}/votacao_candidato_munzona/votacao_candidato_munzona_${YEAR}.zip`, publisher: "Tribunal Superior Eleitoral", license: "Creative Commons Attribution (CC-BY)" },
    { id: `tse-detalhe-${YEAR}`, title: `Detalhe da apuração por município e zona — ${YEAR}`, url: `${BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_${YEAR}.zip`, publisher: "Tribunal Superior Eleitoral", license: "Creative Commons Attribution (CC-BY)" },
    { id: "tse-consulta-cand", title: "Candidatos — consulta_cand", url: "https://dadosabertos.tse.jus.br/dataset/?q=candidatos", publisher: "Tribunal Superior Eleitoral", license: "Creative Commons Attribution (CC-BY)" },
    { id: "bcb-sgs", title: "Sistema Gerenciador de Séries Temporais", url: "https://www3.bcb.gov.br/sgspub/", publisher: "Banco Central do Brasil", license: "Dados públicos oficiais" },
    { id: "ibge-contas-trimestrais", title: "Sistema de Contas Nacionais Trimestrais", url: "https://www.ibge.gov.br/estatisticas/todos-os-produtos-estatisticos/9300-contas-nacionais-trimestrais.html", publisher: "IBGE", license: "Dados públicos oficiais" },
  ].map((s) => ({ ...s, retrieved_on: new Date().toISOString().slice(0, 10) }));

  // ---------------- candidatos do ano (metadados)
  const candZip = await ensureZip(`consulta_cand_${YEAR}.zip`, "consulta_cand");
  const meta = new Map();
  const partyNames = new Map();
  const federations = new Map();
  await eachRow(candZip, "*BRASIL.csv", (r) => {
    meta.set(`${r.SG_UF}|${r.SQ_CANDIDATO}`, { birth_year: birthYear(r.DT_NASCIMENTO), coalition: r.DS_COMPOSICAO_COLIGACAO, coalition_name: r.NM_COLIGACAO });
    partyNames.set(Number(r.NR_PARTIDO), { acronym: r.SG_PARTIDO, name: titleCase(r.NM_PARTIDO?.replace(/\s+/g, " ")), federation: r.NR_FEDERACAO && r.NR_FEDERACAO !== "-1" ? r.NR_FEDERACAO : null });
    if (r.NR_FEDERACAO && r.NR_FEDERACAO !== "-1" && r.NM_FEDERACAO) {
      const f = federations.get(r.NR_FEDERACAO) ?? { code: r.NR_FEDERACAO, acronym: r.SG_FEDERACAO, name: r.NM_FEDERACAO, members: [] };
      if (!f.members.includes(Number(r.NR_PARTIDO))) f.members.push(Number(r.NR_PARTIDO));
      federations.set(r.NR_FEDERACAO, f);
    }
  });
  if (meta.size === 0) {
    // alguns anos não têm o arquivo BRASIL: lê por UF
    await eachRow(candZip, "*.csv", (r) => {
      meta.set(`${r.SG_UF}|${r.SQ_CANDIDATO}`, { birth_year: birthYear(r.DT_NASCIMENTO), coalition: r.DS_COMPOSICAO_COLIGACAO, coalition_name: r.NM_COLIGACAO });
      partyNames.set(Number(r.NR_PARTIDO), { acronym: r.SG_PARTIDO, name: titleCase(r.NM_PARTIDO?.replace(/\s+/g, " ")), federation: null });
    });
  }
  console.log(`candidatos: ${meta.size}`);

  // ---------------- votos (agregados por disputa)
  const votZip = await ensureZip(`votacao_candidato_munzona_${YEAR}.zip`, "votacao_candidato_munzona");
  const races = new Map();
  const raceKey = (office, geo, round) => `${office}|${geo}|${round}`;
  const getRace = (office, geo, round) => {
    const k = raceKey(office, geo, round);
    let r = races.get(k);
    if (!r) {
      r = { office, geo, round, cands: new Map() };
      races.set(k, r);
    }
    return r;
  };
  let n = 0;
  await eachRow(votZip, "*.csv", (r) => {
    const office = CARGO[Number(r.CD_CARGO)];
    if (!office) return;
    const round = Number(r.NR_TURNO);
    const votes = Number(r.QT_VOTOS_NOMINAIS) || 0;
    const geos = office === "PRESIDENTE" ? ["BR", r.SG_UF] : [r.SG_UF];
    for (const geo of geos) {
      if (!UFS.includes(geo) && geo !== "BR") continue;
      const race = getRace(office, geo, round);
      const metaUf = office === "PRESIDENTE" ? "BR" : r.SG_UF;
      const c = race.cands.get(r.SQ_CANDIDATO) ?? {
        sq: uid(metaUf, r.SQ_CANDIDATO),
        rawSq: r.SQ_CANDIDATO,
        metaUf,
        name: titleCase(r.NM_URNA_CANDIDATO),
        party: r.SG_PARTIDO,
        party_number: Number(r.NR_PARTIDO),
        votes: 0,
        status: r.DS_SIT_TOT_TURNO,
        situation: r.DS_SITUACAO_CANDIDATURA,
        coalition: r.DS_COMPOSICAO_COLIGACAO,
        coalition_name: r.NM_COLIGACAO,
      };
      c.votes += votes;
      race.cands.set(r.SQ_CANDIDATO, c);
    }
    if (++n % 2_000_000 === 0) console.log(`  ${n} linhas…`);
  });

  // ---------------- detalhe (eleitorado, comparecimento, brancos, nulos)
  const detZip = await ensureZip(`detalhe_votacao_munzona_${YEAR}.zip`, "detalhe_votacao_munzona");
  const det = new Map();
  await eachRow(detZip, "*.csv", (r) => {
    const office = CARGO[Number(r.CD_CARGO)];
    if (!office) return;
    const round = Number(r.NR_TURNO);
    const geos = office === "PRESIDENTE" ? ["BR", r.SG_UF] : [r.SG_UF];
    for (const geo of geos) {
      if (!UFS.includes(geo) && geo !== "BR") continue;
      const k = raceKey(office, geo, round);
      const d = det.get(k) ?? { electorate: 0, turnout: 0, valid: 0, blank: 0, null_votes: 0 };
      d.electorate += Number(r.QT_APTOS) || 0;
      d.turnout += Number(r.QT_COMPARECIMENTO) || 0;
      d.valid += Number(r.QT_TOTAL_VOTOS_VALIDOS ?? r.QT_VOTOS_VALIDOS) || 0;
      d.blank += Number(r.QT_VOTOS_BRANCOS) || 0;
      d.null_votes += Number(r.QT_TOTAL_VOTOS_NULOS ?? r.QT_VOTOS_NULOS) || 0;
      det.set(k, d);
    }
  });

  // ---------------- monta as disputas no formato do snapshot
  const out = [];
  for (const [k, r] of races) {
    const d = det.get(k) ?? { electorate: 0, turnout: 0, valid: 0, blank: 0, null_votes: 0 };
    const all = [...r.cands.values()].sort((a, b) => b.votes - a.votes);
    const nominalValid = all.reduce((s, c) => s + c.votes, 0);
    const validBase = r.office === "PRESIDENTE" || r.office === "GOVERNADOR" || r.office === "SENADOR" ? nominalValid : d.valid || nominalValid;
    const majoritarian = ["PRESIDENTE", "GOVERNADOR", "SENADOR"].includes(r.office);
    const partyVotes = new Map();
    for (const c of all) partyVotes.set(c.party_number, { number: c.party_number, acronym: c.party, federation: partyNames.get(c.party_number)?.federation ?? null, votes: (partyVotes.get(c.party_number)?.votes ?? 0) + c.votes, agr: c.coalition_name ?? "", agr_seats: 0 });
    const elected = (c) => isElected(c.status);
    for (const c of all.filter(elected)) partyVotes.get(c.party_number).agr_seats += 1;
    const coalitions = new Map();
    if (majoritarian) {
      for (const c of all) {
        if (!c.coalition) continue;
        coalitions.set(c.coalition_name || c.party, { agr: c.coalition_name || c.party, name: titleCase(c.coalition_name || c.party), type: c.coalition.includes("/") ? "c" : "i", members: c.coalition.split("/").map((x) => x.trim()).filter(Boolean) });
      }
    }
    out.push({
      office: r.office,
      geo: r.geo,
      round: r.round,
      electorate: d.electorate,
      turnout: d.turnout,
      valid: validBase,
      blank: d.blank,
      null_votes: d.null_votes,
      quotient: 0,
      candidates: all
        .filter((c) => majoritarian || elected(c))
        .map((c) => ({
          sq: c.sq,
          name: c.name,
          party: c.party,
          party_number: c.party_number,
          birth_year: meta.get(`${c.metaUf}|${c.rawSq}`)?.birth_year ?? null,
          votes: c.votes,
          share: Math.round((c.votes / (validBase || 1)) * 10000) / 100,
          elected: elected(c),
          status: c.status,
          valid: true,
        })),
      parties: [...partyVotes.values()],
      federations: [...federations.values()],
      coalitions: [...coalitions.values()],
    });
  }

  // ---------------- senadores com mandato em curso (eleitos 4 anos antes)
  const prevZip = await ensureZip(`consulta_cand_${YEAR - 4}.zip`, "consulta_cand");
  const senatorsContinuing = [];
  let incumbentPresident = null;
  const override = INCUMBENT_OVERRIDE[YEAR];
  const seen = new Set();
  await eachRow(prevZip, "*.csv", (r) => {
    const key = `${r.SG_UF}|${r.DS_CARGO}|${r.SQ_CANDIDATO}`;
    if (r.DS_CARGO === (override?.cargo ?? "PRESIDENTE") && strip(r.NM_URNA_CANDIDATO) === INCUMBENT_NAME[YEAR] && !incumbentPresident) {
      incumbentPresident = { sq: `${YEAR - 4}-BR-${r.SQ_CANDIDATO}`, name: titleCase(r.NM_URNA_CANDIDATO), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), birth_year: birthYear(r.DT_NASCIMENTO), note: override?.note ?? null };
    }
    if (!isElected(r.DS_SIT_TOT_TURNO) || seen.has(key)) return;
    seen.add(key);
    if (r.DS_CARGO === "SENADOR") {
      senatorsContinuing.push({ sq: `${YEAR - 4}-${r.SG_UF}-${r.SQ_CANDIDATO}`, name: titleCase(r.NM_URNA_CANDIDATO), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), uf: r.SG_UF, birth_year: birthYear(r.DT_NASCIMENTO) });
    }
    if (r.DS_CARGO === (override?.cargo ?? "PRESIDENTE") && !incumbentPresident) {
      incumbentPresident = { sq: `${YEAR - 4}-BR-${r.SQ_CANDIDATO}`, name: titleCase(r.NM_URNA_CANDIDATO), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), birth_year: birthYear(r.DT_NASCIMENTO), note: override?.note ?? null };
    }
  });
  const dedupSen = new Map(senatorsContinuing.map((s) => [s.sq, s]));

  // ---------------- capitais (eleição municipal 2 anos antes)
  const munZip = await ensureZip(`consulta_cand_${YEAR - 2}.zip`, "consulta_cand");
  const municipalCapitals = {};
  for (const uf of Object.keys(CAPITALS)) municipalCapitals[uf] = { capital: titleCase(CAPITALS[uf]), mayor: null, council: {} };
  const seenMun = new Set();
  await eachRow(munZip, "*.csv", (r) => {
    const uf = r.SG_UF;
    if (!CAPITALS[uf] || strip(r.NM_UE) !== CAPITALS[uf]) return;
    if (!isElected(r.DS_SIT_TOT_TURNO)) return;
    const key = `${uf}|${r.DS_CARGO}|${r.SQ_CANDIDATO}`;
    if (seenMun.has(key)) return;
    seenMun.add(key);
    if (r.DS_CARGO === "PREFEITO") municipalCapitals[uf].mayor = { sq: `${YEAR - 2}-${uf}-${r.SQ_CANDIDATO}`, name: titleCase(r.NM_URNA_CANDIDATO), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), birth_year: birthYear(r.DT_NASCIMENTO) };
    if (r.DS_CARGO === "VEREADOR") municipalCapitals[uf].council[r.SG_PARTIDO] = (municipalCapitals[uf].council[r.SG_PARTIDO] ?? 0) + 1;
  });

  // ---------------- economia na data
  const date = RUNOFF[YEAR];
  const economy = {
    selic: (await sgsAt(432, date, 60)) ?? (await sgsAt(1178, date, 30)) ?? (await sgsAt(4189, date, 90)),
    ipca_12m: await sgsAt(13522, date),
    ipca_month: await sgsAt(433, date),
    fx_usd: await sgsAt(1, date),
    debt_gdp: (await sgsAt(13762, date)) ?? (await sgsAt(4513, date)),
    unemployment: (await sgsAt(24369, date)) ?? (UNEMPLOYMENT_FALLBACK[YEAR] ? { date: "referência IBGE/PME", value: UNEMPLOYMENT_FALLBACK[YEAR] } : null),
    gdp_growth: GDP[YEAR][0],
    gdp_level: GDP[YEAR][1],
    source_id: "bcb-sgs",
  };

  const brR1 = out.find((r) => r.office === "PRESIDENTE" && r.geo === "BR" && r.round === 1);
  const electorate = { BR: brR1?.electorate ?? 0, uf: {} };
  for (const r of out) if (r.office === "PRESIDENTE" && r.round === 1 && r.geo !== "BR") electorate.uf[r.geo] = r.electorate;

  const snapshotDate = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const result = {
    meta: {
      year: YEAR,
      snapshot_date: snapshotDate,
      generated_at: new Date().toISOString(),
      note: "Snapshot histórico real. Tudo o que acontecer depois desta data pertence à linha do tempo simulada.",
      minimization: "Importados apenas nome de urna, partido, cargo, UF, ano de nascimento, situação e votos.",
      result_source_id: `tse-votacao-${YEAR}`,
      candidates_source_id: "tse-consulta-cand",
    },
    sources,
    electorate,
    parties: [...partyNames.entries()].map(([number, p]) => ({ number, acronym: p.acronym, name: p.name, federation: p.federation })).sort((a, b) => a.number - b.number),
    federations: [...federations.values()],
    races: out,
    senatorsContinuing: [...dedupSen.values()],
    municipalCapitals,
    incumbentPresident,
    economy,
  };
  mkdirSync(join(ROOT, "data"), { recursive: true });
  writeFileSync(join(ROOT, `data/snapshot-${YEAR}.json`), JSON.stringify(result));
  console.log(`ok ${YEAR}: ${out.length} disputas, ${result.parties.length} partidos, ${dedupSen.size} senadores em curso, presidente em exercício: ${incumbentPresident?.name}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
