import type { EconomyRow } from "@dp/engine";
import { Empty, GameHeader, Panel } from "@/components/game/Page";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/ui";
import { fmtDec, fmtPct } from "@/lib/format";
import { getSession, getWorld, requireMe } from "@/lib/game";

type Key = keyof EconomyRow;
interface Indicator {
  key: Key;
  label: string;
  fmt: (v: number) => string;
  /** sobe = bom? (para colorir a variação) */
  upIsGood: boolean;
  about: string;
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fmtMonth = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1] ?? ""} ${m.slice(0, 4)}`;

const INDICATORS: Indicator[] = [
  { key: "selic", label: "Selic", fmt: (v) => fmtPct(v, 2), upIsGood: false, about: "Juros básicos do Banco Central. Altos seguram a inflação e esfriam a economia." },
  { key: "inflation_12m", label: "Inflação (IPCA 12m)", fmt: (v) => fmtPct(v), upIsGood: false, about: "Alta de preços em 12 meses. Corrói a renda e derruba a aprovação do governo." },
  { key: "unemployment", label: "Desemprego", fmt: (v) => fmtPct(v), upIsGood: false, about: "Parte da força de trabalho sem ocupação. Pesa muito no humor do eleitor." },
  { key: "gdp_growth", label: "Crescimento do PIB", fmt: (v) => fmtPct(v), upIsGood: true, about: "Ritmo anual da atividade. Crescimento favorece quem está no governo." },
  { key: "debt_gdp", label: "Dívida bruta / PIB", fmt: (v) => fmtPct(v), upIsGood: false, about: "Endividamento do governo. Muito alta pressiona juros e câmbio." },
  { key: "fx", label: "Dólar", fmt: (v) => `R$ ${fmtDec(v, 2)}`, upIsGood: false, about: "Câmbio. Dólar caro encarece importados e alimenta a inflação." },
  { key: "confidence", label: "Confiança", fmt: (v) => fmtDec(v, 0), upIsGood: true, about: "Humor de empresas e consumidores, de 0 a 200. Puxa investimento e consumo." },
  { key: "primary_balance", label: "Resultado primário", fmt: (v) => fmtPct(v, 2), upIsGood: true, about: "Receitas menos despesas do governo, sem juros, em % do PIB." },
];

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const world = await getWorld(year);
  const { data } = await sb.from("economy_snapshots").select("*").eq("world_id", me.worldId).order("month", { ascending: false }).limit(60);
  const rows = ((data ?? []) as EconomyRow[]).reverse();
  const e = rows[rows.length - 1];
  const ref = rows.length > 12 ? rows[rows.length - 13] : rows[0];
  const approval = world?.gov.approval ?? 0;

  return (
    <>
      <GameHeader
        kicker="O país"
        icon="chart"
        title="Economia"
        lede="O ponto de partida usa números reais do Banco Central e do IBGE. Daí em diante, a economia é modelada pelo jogo: juros, gasto público, confiança e choques."
      />
      {!e ? (
        <Panel>
          <Empty icon="chart" title="Sem dados econômicos ainda" />
        </Panel>
      ) : (
        <>
          <div className="hint-band">
            <Icon name="info" size={18} />
            <span>
              Aprovação do governo federal: <b>{fmtPct(approval, 0)}</b>. Inflação e desemprego altos derrubam a aprovação e ajudam a oposição nas eleições. Dados de{" "}
              <b>{fmtMonth(e.month)}</b>
              {ref && ref !== e ? (
                <>
                  , comparados a {fmtMonth(ref.month)}
                </>
              ) : null}
              .
            </span>
          </div>
          <div className="ecogrid">
            {INDICATORS.map((ind) => {
              const now = Number(e[ind.key]);
              const before = ref ? Number(ref[ind.key]) : now;
              const d = now - before;
              const flat = Math.abs(d) < 0.005;
              const good = ind.upIsGood ? d > 0 : d < 0;
              return (
                <Panel key={ind.key} className="eco">
                  <div className="eco__top">
                    <span>{ind.label}</span>
                    {!flat && <em className={good ? "up" : "down"}>{`${d > 0 ? "▲" : "▼"} ${fmtDec(Math.abs(d), 2)}`}</em>}
                  </div>
                  <b className="eco__value mono">{ind.fmt(now)}</b>
                  <Sparkline values={rows.map((r) => Number(r[ind.key]))} color={flat ? "var(--apagado)" : good ? "var(--mata)" : "var(--urgente)"} />
                  <p>{ind.about}</p>
                </Panel>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
