import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { Sparkline } from "@/components/ui";
import { fmtDate, fmtDec, fmtNum } from "@/lib/format";
import { getSession } from "@/lib/game";
import { adminOverview, probeWorld, type AdminWorld } from "@/lib/sim";

export const metadata: Metadata = { title: "Saúde do jogo", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Contas com acesso ao painel: ids separados por vírgula em ADMIN_USER_IDS. */
const ADMINS = new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const mb = (b: number) => `${fmtDec(b / 1024 / 1024, 1)} MB`;
/** limite do banco no plano gratuito do Supabase */
const DB_LIMIT = 500 * 1024 * 1024;

function Kpi({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`kpi${warn ? " kpi--warn" : ""}`}>
      <span>{label}</span>
      <b className="mono">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

function World({ w, probe }: { w: AdminWorld; probe: { loadMs: number; lagDays: number } | null }) {
  const series = (k: "selic" | "inflation" | "unemployment" | "gdp") => w.economy.map((e) => Number(e[k]));
  const last = w.economy.at(-1);
  return (
    <section className="admin-world">
      <header>
        <h2>
          Mundo {w.id.replace(/^br/, "")} <span className="muted small">· {fmtDate(w.game_date)} · dia {fmtNum(w.tick)}</span>
        </h2>
        <span className="muted small">
          {w.speed} dias/h · carga {probe ? `${fmtNum(probe.loadMs)} ms` : "falhou"}
        </span>
      </header>
      <div className="kpis">
        <Kpi label="Jogadores ativos" value={fmtNum(w.players)} note={`${w.players_24h} em 24 h · ${w.players_7d} em 7 dias`} />
        <Kpi label="Ações em 24 h" value={fmtNum(w.actions_24h)} note={`${fmtNum(w.advances_24h)} dias avançados à mão`} />
        <Kpi label="Pessoas no mundo" value={fmtNum(w.persons)} note={`${fmtNum(w.news)} notícias`} />
        <Kpi label="Atraso do relógio" value={probe ? `${fmtNum(probe.lagDays)} d` : "—"} note="dias a processar até agora" warn={!probe || probe.lagDays > 30} />
        <Kpi label="Condutas ilegais" value={fmtNum(w.acts)} note={`${w.acts_discovered} descobertas`} />
        <Kpi label="Investigações" value={fmtNum(w.investigations_open)} note={`abertas · ${w.investigations_closed} encerradas · ${w.convictions} condenações`} />
        <Kpi label="Partidos de jogadores" value={fmtNum(w.parties_player)} />
      </div>
      {last && (
        <div className="admin-econ">
          {(
            [
              ["Selic", "selic", fmtDec(last.selic, 2) + "%"],
              ["Inflação 12m", "inflation", fmtDec(last.inflation, 1) + "%"],
              ["Desemprego", "unemployment", fmtDec(last.unemployment, 1) + "%"],
              ["PIB", "gdp", fmtDec(last.gdp, 1) + "%"],
            ] as const
          ).map(([label, k, v]) => (
            <div key={k}>
              <span>
                {label} <b className="mono">{v}</b>
              </span>
              <Sparkline values={series(k)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Painel de saúde: contas, banco e o estado de cada mundo. */
export default async function Page() {
  const { user } = await getSession();
  if (!user || !ADMINS.has(user.id)) notFound();
  const o = await adminOverview();
  const loads = await Promise.all(o.worlds.map((w) => probeWorld(w.id).catch(() => null)));
  return (
    <>
      <AppHeader />
      <PageHero kicker="Administração" title="Saúde do jogo" lede={`Retrato de ${new Date(o.now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`} />
      <main className="container page-body admin">
        <div className="kpis">
          <Kpi label="Contas" value={fmtNum(o.accounts)} note={`${o.accounts_7d} nos últimos 7 dias`} />
          <Kpi label="Sem confirmar e-mail" value={fmtNum(o.unconfirmed)} warn={o.unconfirmed > o.accounts / 2 && o.accounts > 4} />
          <Kpi label="Banco de dados" value={mb(o.db_bytes)} note={`${Math.round((o.db_bytes / DB_LIMIT) * 100)}% de 500 MB`} warn={o.db_bytes > DB_LIMIT * 0.7} />
          <Kpi label="Mundos" value={fmtNum(o.worlds.length)} />
        </div>
        {o.worlds.map((w, i) => (
          <World key={w.id} w={w} probe={loads[i]} />
        ))}
        <section className="admin-world">
          <header>
            <h2>Maiores tabelas</h2>
          </header>
          <ul className="admin-tables">
            {o.tables.map((t) => (
              <li key={t.name}>
                <span className="mono">{t.name}</span>
                <span className="bar" style={{ width: `${Math.max(2, (t.bytes / (o.tables[0]?.bytes || 1)) * 100)}%` }} />
                <b className="mono">{mb(t.bytes)}</b>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <Footer />
    </>
  );
}
