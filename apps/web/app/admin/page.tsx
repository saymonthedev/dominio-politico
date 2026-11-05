import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { Sparkline } from "@/components/ui";
import { fmtDate, fmtDec, fmtNum } from "@/lib/format";
import { getSession } from "@/lib/game";
import { adminOverview, asPlayer, lagDaysOf, MAX_PRIVATE_WORLDS, modeOfWorld, type AdminOverview, type AdminSharedWorld, type AdminWorldRow } from "@/lib/sim";

export const metadata: Metadata = { title: "Saúde do jogo", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Contas com acesso ao painel: ids separados por vírgula em ADMIN_USER_IDS. */
const ADMINS = new Set((process.env.ADMIN_USER_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean));

const mb = (b: number) => `${fmtDec(b / 1024 / 1024, 1)} MB`;
/** limite do banco no plano gratuito do Supabase */
const DB_LIMIT = 500 * 1024 * 1024;
/** o painel nunca fica carregando sem fim: passou disso, mostra o aviso */
const DEADLINE_MS = 25_000;

const MODE_LABEL = { SHARED: "compartilhado", PRIVATE: "próprio", FICTIONAL: "fictício" } as const;

function Kpi({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`kpi${warn ? " kpi--warn" : ""}`}>
      <span>{label}</span>
      <b className="mono">{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

/** "há 3 h", "há 2 dias" */
function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return "—";
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

function SharedWorld({ row, d, now }: { row: AdminWorldRow; d: AdminSharedWorld; now: number }) {
  const series = (k: "selic" | "inflation" | "unemployment" | "gdp") => d.economy.map((e) => Number(e[k]));
  const last = d.economy.at(-1);
  const lag = lagDaysOf(row, now);
  return (
    <section className="admin-world">
      <header>
        <h2>
          Mundo {row.id.replace(/^br/, "")} <span className="muted small">· {fmtDate(row.game_date)} · dia {fmtNum(row.tick)}</span>
        </h2>
        <span className="muted small">{row.speed} dias/h</span>
      </header>
      <div className="kpis">
        <Kpi label="Jogadores" value={fmtNum(row.players)} note={`${row.players_24h} ativos em 24 h`} />
        <Kpi label="Ações em 24 h" value={fmtNum(row.actions_24h)} note={`${fmtNum(row.advances_24h)} dias avançados à mão`} />
        <Kpi label="Pessoas no mundo" value={fmtNum(d.persons)} note={`${fmtNum(d.news)} notícias`} />
        <Kpi label="Atraso do relógio" value={`${fmtNum(lag)} d`} note="dias a processar até agora" warn={lag > 30} />
        <Kpi label="Condutas ilegais" value={fmtNum(d.acts)} note={`${d.acts_discovered} descobertas`} />
        <Kpi label="Investigações" value={fmtNum(d.investigations_open)} note={`abertas · ${d.investigations_closed} encerradas · ${d.convictions} condenações`} />
        <Kpi label="Partidos de jogadores" value={fmtNum(d.parties_player)} />
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

/** Uma linha por mundo: o que importa para saber se está vivo, parado ou saindo. */
function WorldsTable({ worlds, now }: { worlds: AdminWorldRow[]; now: number }) {
  return (
    <section className="admin-world">
      <header>
        <h2>Todos os mundos</h2>
        <span className="muted small">mais recentes primeiro · atividade = última ação, avanço ou criação de personagem</span>
      </header>
      <div className="table-wrap">
        <table className="admin-worlds">
          <thead>
            <tr>
              <th>Mundo</th>
              <th>Tipo</th>
              <th>Data no jogo</th>
              <th className="num">Dia</th>
              <th className="num">Jogadores</th>
              <th className="num">Ações 24 h</th>
              <th>Última atividade</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {worlds.map((w) => {
              const mode = modeOfWorld(w.id);
              const lag = lagDaysOf(w, now);
              const status = w.dropping ? "sendo removido" : w.warned ? "avisado (parado)" : mode === "SHARED" && lag > 30 ? `relógio ${fmtNum(lag)} d atrasado` : "ok";
              return (
                <tr key={w.id}>
                  <td className="mono">{w.id}</td>
                  <td>{MODE_LABEL[mode]}</td>
                  <td>{fmtDate(w.game_date)}</td>
                  <td className="num mono">{fmtNum(w.tick)}</td>
                  <td className="num mono">{fmtNum(w.players)}</td>
                  <td className="num mono">{fmtNum(w.actions_24h)}</td>
                  <td>{ago(w.last_active, now)}</td>
                  <td className={status === "ok" ? "muted" : undefined}>{status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function withDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("O banco demorou demais para responder.")), ms);
  });
  return Promise.race([p, late]).finally(() => clearTimeout(timer));
}

/** Painel de saúde: contas, banco e o estado de cada mundo, sem abrir mundo nenhum. */
export default async function Page() {
  const { sb, user } = await getSession();
  if (!user || !ADMINS.has(user.id)) notFound();
  const token = (await sb.auth.getSession()).data.session?.access_token;
  let o: AdminOverview | null = null;
  let failure = "";
  try {
    // no papel do administrador logado: o banco dá mais tempo a quem está logado do que ao anônimo
    o = await withDeadline(
      asPlayer(token, () => adminOverview()),
      DEADLINE_MS,
    );
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  if (!o) {
    return (
      <>
        <AppHeader />
        <PageHero kicker="Administração" title="Saúde do jogo" lede="O painel não conseguiu ler os números agora." />
        <main className="container page-body admin">
          <section className="admin-world">
            <p>
              <b>Não deu para carregar.</b> {failure}
            </p>
            <p className="muted small">Geralmente é o banco sobrecarregado. Recarregue a página em alguns instantes.</p>
          </section>
        </main>
        <Footer />
      </>
    );
  }
  const now = Date.parse(o.now) || Date.now();
  const own = o.worlds.filter((w) => modeOfWorld(w.id) !== "SHARED" && !w.dropping).length;
  // banco ainda sem o painel leve: os detalhes dos compartilhados vêm dentro de cada mundo
  const shared: AdminSharedWorld[] = o.shared ?? (o.worlds.filter((w) => modeOfWorld(w.id) === "SHARED") as unknown as AdminSharedWorld[]);
  const rows = new Map(o.worlds.map((w) => [w.id, w]));
  return (
    <>
      <AppHeader />
      <PageHero kicker="Administração" title="Saúde do jogo" lede={`Retrato de ${new Date(o.now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`} />
      <main className="container page-body admin">
        <div className="kpis">
          <Kpi label="Contas" value={fmtNum(o.accounts)} note={`${o.accounts_24h ?? "—"} em 24 h · ${o.accounts_7d} em 7 dias`} />
          <Kpi label="Sem confirmar e-mail" value={fmtNum(o.unconfirmed)} warn={o.unconfirmed > o.accounts / 2 && o.accounts > 4} />
          <Kpi label="Banco de dados" value={mb(o.db_bytes)} note={`${Math.round((o.db_bytes / DB_LIMIT) * 100)}% de 500 MB`} warn={o.db_bytes > DB_LIMIT * 0.7} />
          <Kpi label="Mundos próprios" value={`${own} / ${MAX_PRIVATE_WORLDS}`} note={`${o.worlds.length} mundos no total`} warn={own >= MAX_PRIVATE_WORLDS} />
          <Kpi label="Erros em 24 h" value={fmtNum(o.errors_24h)} note={`${o.errors_7d} em 7 dias`} warn={o.errors_24h > 0} />
        </div>
        <section className="admin-world">
          <header>
            <h2>Erros recentes</h2>
            <span className="muted small">páginas, ações e tarefa diária · guardados por 14 dias</span>
          </header>
          {o.errors.length ? (
            <ul className="admin-errors">
              {o.errors.map((e, i) => (
                <li key={i}>
                  <span className="mono small muted">
                    {new Date(e.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {e.source}
                    {e.path ? ` · ${e.path}` : ""}
                    {e.digest ? ` · ${e.digest}` : ""}
                  </span>
                  <b>{e.message}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Nenhum erro registrado.</p>
          )}
        </section>
        <WorldsTable worlds={o.worlds} now={now} />
        {shared.map((d) => {
          const row = rows.get(d.id);
          return row ? <SharedWorld key={d.id} row={row} d={d} now={now} /> : null;
        })}
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
