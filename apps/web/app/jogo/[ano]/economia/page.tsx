import type { EconomyRow } from "@dp/engine";
import { Sparkline, Stat } from "@/components/ui";
import { fmtDec, fmtPct } from "@/lib/format";
import { getSession, getWorld, requireMe } from "@/lib/game";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const world = await getWorld(year);
  const { data } = await sb.from("economy_snapshots").select("*").eq("world_id", me.worldId).order("month", { ascending: false }).limit(60);
  const rows = ((data ?? []) as EconomyRow[]).reverse();
  const e = rows[rows.length - 1];
  const series = (k: keyof EconomyRow) => rows.map((r) => Number(r[k]));
  if (!e) return <div className="empty">Sem dados econômicos ainda.</div>;
  const cards: Array<[string, keyof EconomyRow, (v: number) => string]> = [
    ["Selic", "selic", (v) => fmtPct(v, 2)],
    ["IPCA 12 meses", "inflation_12m", (v) => fmtPct(v)],
    ["Desemprego", "unemployment", (v) => fmtPct(v)],
    ["Crescimento (ritmo anual)", "gdp_growth", (v) => fmtPct(v)],
    ["Dívida bruta / PIB", "debt_gdp", (v) => fmtPct(v)],
    ["Dólar", "fx", (v) => `R$ ${fmtDec(v, 2)}`],
    ["Confiança", "confidence", (v) => fmtDec(v, 0)],
    ["Resultado primário (% PIB)", "primary_balance", (v) => fmtPct(v, 2)],
  ];
  return (
    <>
      <h1>Economia</h1>
      <p className="muted" style={{ maxWidth: 760 }}>
        Condições iniciais reais (Banco Central e IBGE no ponto de partida). Depois disso, modelagem de jogo: juros reais, impulso fiscal, confiança, choques
        externos e de oferta. Aprovação do governo federal: <b>{fmtPct(world?.gov.approval ?? 0, 0)}</b>.
      </p>
      <div className="grid grid-4">
        {cards.map(([label, key, f]) => (
          <div key={key} className="card">
            <Stat label={label} value={f(Number(e[key]))} hint={`mês ${e.month}`} />
            <Sparkline values={series(key)} />
          </div>
        ))}
      </div>
    </>
  );
}
