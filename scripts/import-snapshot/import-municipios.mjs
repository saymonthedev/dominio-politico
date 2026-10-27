/**
 * Importa os 5.570 municípios para cada ponto de partida:
 *  - prefeito e câmara eleitos na eleição municipal ordinária de dois anos antes;
 *  - eleitorado apto naquela eleição;
 *  - votos do 2º turno presidencial do ano de partida em cada cidade.
 *
 * Fontes: Dados Abertos do TSE (consulta_cand, detalhe_votacao_munzona,
 * votacao_candidato_munzona) e, para 2026, o portal de resultados do TSE.
 * A equivalência código TSE ↔ IBGE vem da configuração oficial de 2026.
 *
 * Saída: data/municipios-<ano>.json e data/municipios-tse-ibge.json
 * Uso: node scripts/import-snapshot/import-municipios.mjs [--year 2018]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { birthYear, eachRow, ensureZip, fetchJsonCached, isElected, nationalCsv, ROOT, titleCase, UFS } from "./tse-lib.mjs";

const YEARS = [2002, 2006, 2010, 2014, 2018, 2022, 2026];
const arg = process.argv.indexOf("--year");
const only = arg > 0 ? Number(process.argv[arg + 1]) : null;
if (only && !YEARS.includes(only)) {
  console.error(`Ano inválido. Use um destes: ${YEARS.join(", ")}`);
  process.exit(1);
}

const RES = "https://resultados.tse.jus.br/oficial/ele2026";
const PRES_RUNOFF_2026 = "6258";
// o código do tipo de eleição muda entre anos (0 ou 2 para ordinária); o nome é estável
const isOrdinary = (r) => /ORDIN/i.test(r.NM_TIPO_ELEICAO ?? "");
const isSupplementary = (r) => /SUPLEMENTAR/i.test(r.NM_TIPO_ELEICAO ?? "");
const isoDate = (br) => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(br ?? "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};
const CARGO_PREFEITO = 11;
const CARGO_VICE = 12;
const CARGO_VEREADOR = 13;
/** Nome de urna; em arquivos antigos o vice vem sem ele ("#NE"): usa o nome completo. */
const urnaName = (r) => titleCase(/^#|^$/.test(r.NM_URNA_CANDIDATO ?? "") ? r.NM_CANDIDATO : r.NM_URNA_CANDIDATO);
/** Chapa: em 2000 o vice tinha número próprio (131 para a chapa 13), então usa os dois primeiros dígitos. */
const ticketOf = (tse, r) => `${tse}|${String(r.NR_CANDIDATO).slice(0, 2)}|${isOrdinary(r) ? "ord" : isoDate(r.DT_ELEICAO)}`;
const fullKey = (r) => `${(r.NM_CANDIDATO ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim()}|${/\d{2}\/\d{2}\/\d{4}/.test(r.DT_NASCIMENTO ?? "") ? r.DT_NASCIMENTO : ""}`;
/** CPF só para casar a mesma pessoa entre eleições; nunca vai para os arquivos gerados. */
const cpfKey = (r) => (/^\d{11}$/.test(r.NR_CPF_CANDIDATO ?? "") ? `cpf:${r.NR_CPF_CANDIDATO}` : null);
const num = (v) => Number(String(v ?? "").replace(/\D/g, "")) || 0;

// ---------------------------------------------------------------- equivalência TSE ↔ IBGE
const cfg = await fetchJsonCached(`${RES}/${PRES_RUNOFF_2026}/config/mun-e00${PRES_RUNOFF_2026}-cm.json`);
const byTse = new Map();
for (const abr of cfg.abr) {
  const uf = abr.cd.toUpperCase();
  if (!UFS.includes(uf)) continue;
  for (const m of abr.mu) byTse.set(num(m.cd), { tse: num(m.cd), tsePadded: m.cd, ibge: m.cdi, uf, rawName: m.nm, capital: m.c === "s" });
}
console.log(`municípios na tabela do TSE: ${byTse.size}`);
writeFileSync(
  join(ROOT, "data/municipios-tse-ibge.json"),
  JSON.stringify({ source: "TSE, configuração de municípios das Eleições 2026", rows: [...byTse.values()].map(({ tse, ibge, uf, capital }) => ({ tse, ibge, uf, capital })) }),
);

// nomes com acentos e caixa corretos, da malha do IBGE
const meshNames = new Map();
for (const uf of UFS) {
  const code = [...byTse.values()].find((m) => m.uf === uf).ibge.slice(0, 2);
  try {
    const topo = JSON.parse(readFileSync(join(ROOT, `apps/web/public/geo/mun-${code}.json`), "utf8"));
    for (const g of topo.objects[Object.keys(topo.objects)[0]].geometries) meshNames.set(String(g.properties.id), g.properties.name);
  } catch {
    // UF sem malha: usa o nome do TSE
  }
}

async function presidentialByCity(year) {
  const out = new Map();
  const add = (tse, name, votes) => {
    const m = out.get(tse) ?? {};
    m[name] = (m[name] ?? 0) + votes;
    out.set(tse, m);
  };
  if (year === 2026) {
    const list = [...byTse.values()];
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const m = list[i++];
        const json = await fetchJsonCached(`${RES}/${PRES_RUNOFF_2026}/dados/${m.uf.toLowerCase()}/${m.uf.toLowerCase()}${m.tsePadded}-c0001-e00${PRES_RUNOFF_2026}-u.json`);
        for (const agr of json?.carg?.[0]?.agr ?? []) for (const par of agr.par ?? []) for (const c of par.cand ?? []) add(m.tse, titleCase(c.nmu), num(c.vap));
      }
    };
    await Promise.all(Array.from({ length: 12 }, worker));
    return out;
  }
  const zip = await ensureZip(`votacao_candidato_munzona_${year}.zip`, "votacao_candidato_munzona");
  await eachRow(zip, nationalCsv(zip), (r) => {
    if (Number(r.CD_CARGO) !== 1 || Number(r.NR_TURNO) !== 2 || !UFS.includes(r.SG_UF)) return;
    add(num(r.CD_MUNICIPIO), titleCase(r.NM_URNA_CANDIDATO), Number(r.QT_VOTOS_NOMINAIS) || 0);
  });
  return out;
}

async function importYear(year) {
  const M = year - 2;
  const snap = JSON.parse(readFileSync(join(ROOT, `data/snapshot-${year}.json`), "utf8"));
  const startDate = snap.meta.snapshot_date;
  console.log(`\n== ${year} (eleição municipal de ${M}, suplementares até ${startDate})`);

  // prefeitos e câmaras
  const candZip = await ensureZip(`consulta_cand_${M}.zip`, "consulta_cand");
  const mayors = new Map();
  const councils = new Map();
  const seen = new Set();
  const mayorDate = new Map();
  const vices = new Map();
  let supplementary = 0;
  await eachRow(candZip, nationalCsv(candZip), (r) => {
    const date = isoDate(r.DT_ELEICAO);
    const supl = isSupplementary(r);
    // suplementares só contam se aconteceram antes do ponto de partida
    if (!isOrdinary(r) && !(supl && date && date <= startDate)) return;
    const cargo = Number(r.CD_CARGO);
    if (cargo === CARGO_VICE) {
      // o vice não tem situação de "eleito" própria: guarda por chapa e confere depois
      const v = { sq: `${M}-${r.SG_UF}-${r.SQ_CANDIDATO}`, name: urnaName(r), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), birth_year: birthYear(r.DT_NASCIMENTO), ticket: ticketOf(num(r.SG_UE), r) };
      vices.set(v.ticket, v);
      return;
    }
    if ((cargo !== CARGO_PREFEITO && cargo !== CARGO_VEREADOR) || !isElected(r.DS_SIT_TOT_TURNO)) return;
    if (supl && cargo !== CARGO_PREFEITO) return;
    const tse = num(r.SG_UE);
    const key = `${tse}|${cargo}|${r.SQ_CANDIDATO}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (cargo === CARGO_PREFEITO) {
      // o eleito mais recente é quem governa na data de partida
      if ((mayorDate.get(tse) ?? "") > date) return;
      if (supl) supplementary++;
      mayorDate.set(tse, date);
      mayors.set(tse, { sq: `${M}-${r.SG_UF}-${r.SQ_CANDIDATO}`, name: titleCase(r.NM_URNA_CANDIDATO), party: r.SG_PARTIDO, party_number: Number(r.NR_PARTIDO), birth_year: birthYear(r.DT_NASCIMENTO), elected_on: date, supplementary: supl, ticket: ticketOf(tse, r), who: fullKey(r), cpf: cpfKey(r) });
    } else {
      const c = councils.get(tse) ?? {};
      c[r.SG_PARTIDO] = (c[r.SG_PARTIDO] ?? 0) + 1;
      councils.set(tse, c);
    }
  });

  // Prefeito que disputou a eleição geral do ano de partida renunciou em abril
  // (desincompatibilização): quem governa na data de partida é o vice.
  const genZip = await ensureZip(`consulta_cand_${year}.zip`, "consulta_cand");
  const ranGeneral = new Set();
  await eachRow(genZip, nationalCsv(genZip), (r) => {
    if (!isOrdinary(r)) return;
    // nome completo e nascimento: o nome de urna muda de uma eleição para outra
    const k = fullKey(r);
    ranGeneral.add(`${r.SG_UF}|${k}`);
    ranGeneral.add(`${r.SG_UF}|${k.split("|")[0]}|`);
    const c = cpfKey(r);
    if (c) ranGeneral.add(c);
  });
  let replaced = 0;
  for (const [tse, m] of mayors) {
    const uf = byTse.get(tse)?.uf;
    const [nm, dt] = m.who.split("|");
    if (!uf || !(ranGeneral.has(dt ? `${uf}|${nm}|${dt}` : `${uf}|${nm}|`) || (m.cpf && ranGeneral.has(m.cpf)))) continue;
    const vice = vices.get(m.ticket);
    if (!vice) continue;
    mayors.set(tse, { ...vice, elected_on: m.elected_on, supplementary: m.supplementary, replaced: { name: m.name, party: m.party, reason: `foi candidato(a) na eleição geral de ${year}, e o vice assumiu a prefeitura` } });
    replaced++;
  }
  // correções documentadas (morte, cassação): data/correcoes-municipais.json
  const fixes = JSON.parse(readFileSync(join(ROOT, "data/correcoes-municipais.json"), "utf8")).correcoes.filter((c) => c.ano_partida === year);
  for (const f of fixes) {
    const m = [...byTse.values()].find((x) => x.ibge === f.ibge);
    if (!m) continue;
    const prev = mayors.get(m.tse);
    mayors.set(m.tse, { sq: null, ...f.prefeito, elected_on: prev?.elected_on ?? null, supplementary: false, replaced: f.substituido, correction: f.fonte });
    replaced++;
  }
  for (const m of mayors.values()) {
    delete m.ticket;
    delete m.who;
    delete m.cpf;
  }

  // eleitorado apto na eleição municipal
  const detZip = await ensureZip(`detalhe_votacao_munzona_${M}.zip`, "detalhe_votacao_munzona");
  const electorate = new Map();
  await eachRow(detZip, nationalCsv(detZip), (r) => {
    if (!isOrdinary(r) || Number(r.CD_CARGO) !== CARGO_PREFEITO || Number(r.NR_TURNO) !== 1) return;
    const tse = num(r.CD_MUNICIPIO);
    electorate.set(tse, (electorate.get(tse) ?? 0) + (Number(r.QT_APTOS) || 0));
  });

  const president = await presidentialByCity(year);

  const rows = [];
  let missing = 0;
  for (const m of byTse.values()) {
    // o DF não tem eleição municipal: eleitorado do snapshot
    const e = m.uf === "DF" ? snap.electorate.uf.DF ?? 0 : electorate.get(m.tse) ?? 0;
    // municípios instalados depois da eleição municipal ainda não existiam
    if (!e && !mayors.has(m.tse) && m.uf !== "DF") {
      missing++;
      continue;
    }
    rows.push({
      id: m.ibge,
      tse: m.tse,
      uf: m.uf,
      name: meshNames.get(m.ibge) ?? titleCase(m.rawName),
      capital: m.capital,
      electorate: e,
      mayor: mayors.get(m.tse) ?? null,
      council: councils.get(m.tse) ?? {},
      president: president.get(m.tse) ?? {},
    });
  }
  rows.sort((a, b) => a.id.localeCompare(b.id));
  const out = {
    meta: {
      year,
      municipal_election: M,
      generated_at: new Date().toISOString(),
      note: "Prefeitos e câmaras eleitos na eleição municipal ordinária anterior ao ponto de partida (sem eleições suplementares). Votos do 2º turno presidencial do ano de partida.",
      sources: ["tse-consulta-cand", "tse-detalhe-votacao", "tse-votacao-candidato"],
    },
    municipalities: rows,
  };
  writeFileSync(join(ROOT, `data/municipios-${year}.json`), JSON.stringify(out));
  const withMayor = rows.filter((r) => r.mayor).length;
  const totalE = rows.reduce((s, r) => s + r.electorate, 0);
  const withPres = rows.filter((r) => Object.keys(r.president).length).length;
  console.log(`ok ${year}: ${rows.length} municípios, ${withMayor} com prefeito, eleitorado ${totalE.toLocaleString("pt-BR")}, 2º turno em ${withPres}, suplementares: ${supplementary}, vices que assumiram: ${replaced}, ainda não instalados: ${missing}`);
}

for (const y of only ? [only] : YEARS) await importYear(y);
