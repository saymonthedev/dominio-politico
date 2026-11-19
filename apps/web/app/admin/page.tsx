import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { AdminSuggestions } from "@/components/AdminSuggestions";
import { Sparkline } from "@/components/ui";
import { isAdmin } from "@/lib/admin";
import { fmtDate, fmtDec, fmtNum } from "@/lib/format";
import { getSession } from "@/lib/game";
import { adminOverview, adminRetention, asPlayer, lagDaysOf, MAX_PRIVATE_WORLDS, modeOfWorld, type AdminOverview, type AdminRetention, type AdminSharedWorld, type AdminWorldRow } from "@/lib/sim";
import { adminSuggestions, type AdminSuggestion } from "@/lib/suggestions";

export const metadata: Metadata = { title: "Saúde do jogo", robots: { index: false } };
export const dynamic = "force-dynamic";


const mb = (b: number) => `${fmtDec(b / 1024 / 1024, 1)} MB`;
/** número contado pelo motor do mundo; "—" até ele contar (na próxima virada da rodada) */
const num = (v: number | null | undefined) => (v == null ? "—" : fmtNum(v));
/** espaço de banco incluído no plano Pro do Supabase (desde 14/11/2026; antes, 500 MB no grátis) */
const DB_LIMIT = 8 * 1024 * 1024 * 1024;
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
        <Kpi label="Pessoas no mundo" value={num(d.persons)} note={d.persons == null ? `${num(d.news)} notícias · contagem na próxima virada` : `${num(d.news)} notícias`} />
        <Kpi label="Atraso do relógio" value={`${fmtNum(lag)} d`} note="dias a processar até agora" warn={lag > 30} />
        <Kpi label="Condutas ilegais" value={num(d.acts)} note={`${num(d.acts_discovered)} descobertas`} />
        <Kpi label="Investigações" value={num(d.investigations_open)} note={`abertas · ${num(d.investigations_closed)} encerradas · ${num(d.convictions)} condenações`} />
        <Kpi label="Partidos de jogadores" value={num(d.parties_player)} />
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
  if (!user || !isAdmin(user.id)) notFound();
  // sugestões dos jogadores: carregam junto, e um erro aqui não derruba o painel
  const suggestionsP = adminSuggestions().catch((e: unknown) => (e instanceof Error ? e.message : String(e)));
  const token = (await sb.auth.getSession()).data.session?.access_token;
  // retenção e receita: também em paralelo, e um erro aqui não derruba o painel
  const retentionP = withDeadline(asPlayer(token, () => adminRetention()), DEADLINE_MS).catch(() => null);
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
  const suggestions = await suggestionsP;
  const r = (await retentionP) as AdminRetention | null;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
  const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace(".", ",")}`;
  const fresh = Array.isArray(suggestions) ? suggestions.filter((x: AdminSuggestion) => x.status === "NOVA").length : 0;
  return (
    <>
      <AppHeader />
      <PageHero kicker="Administração" title="Saúde do jogo" lede={`Retrato de ${new Date(o.now).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`} />
      <main className="container page-body admin">
        <div className="kpis">
          <Kpi label="Contas" value={fmtNum(o.accounts)} note={`${o.accounts_24h ?? "—"} em 24 h · ${o.accounts_7d} em 7 dias`} />
          <Kpi label="Sem confirmar e-mail" value={fmtNum(o.unconfirmed)} warn={o.unconfirmed > o.accounts / 2 && o.accounts > 4} />
          <Kpi label="Banco de dados" value={mb(o.db_bytes)} note={`${Math.round((o.db_bytes / DB_LIMIT) * 100)}% de 8 GB (plano Pro)`} warn={o.db_bytes > DB_LIMIT * 0.7} />
          <Kpi label="Mundos próprios" value={`${own} / ${MAX_PRIVATE_WORLDS}`} note={`${o.worlds.length} mundos no total`} warn={own >= MAX_PRIVATE_WORLDS} />
          <Kpi label="Erros em 24 h" value={fmtNum(o.errors_24h)} note={`${o.errors_7d} em 7 dias`} warn={o.errors_24h > 0} />
        </div>
        {r && (
          <section className="admin-world" id="retencao">
            <header>
              <h2>Retenção e receita</h2>
            </header>
            <div className="kpis">
              <Kpi label="Contas novas" value={fmtNum(r.accounts_7d)} note={`${r.accounts_30d} em 30 dias · ${pct(r.with_character_30d, r.accounts_30d)} criaram personagem`} />
              <Kpi label="Voltaram depois do 1º dia" value={pct(r.returned_30d, r.cohort_30d)} note={`${r.returned_30d} de ${r.cohort_30d} que jogaram (contas de 2 a 30 dias)`} warn={r.cohort_30d > 4 && r.returned_30d / r.cohort_30d < 0.3} />
              <Kpi label="Jogando" value={fmtNum(r.active_24h)} note={`nas últimas 24 h · ${r.active_7d} em 7 dias`} />
              <Kpi label="Teste grátis → assinatura" value={pct(r.trials_paid, r.trials)} note={`${r.trials_paid} de ${r.trials} testes`} />
              <Kpi label="Assinantes pagando" value={fmtNum(r.paying)} note={`${r.lapsed_30d} venceram sem renovar em 30 dias · ${r.annual} anuais`} warn={r.lapsed_30d > r.paying / 2} />
              <Kpi label="Receita do mês" value={brl(r.revenue_month)} note={`${brl(r.revenue_30d)} em 30 dias · ${r.payments_30d} pagamentos · ${brl(r.revenue_total)} no total`} />
              <Kpi label="Convites" value={fmtNum(r.referrals)} note={`${r.referrals_rewarded} amigos assinaram (7 dias para quem convidou)`} />
            </div>
            <div className="admin-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Dia</th>
                    <th scope="col">Contas novas</th>
                    <th scope="col">Criaram personagem</th>
                    <th scope="col">Primeiro pagamento</th>
                    <th scope="col">Jogaram</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.days].reverse().map((d) => (
                    <tr key={d.d}>
                      <th scope="row" className="mono">{d.d.slice(8, 10)}/{d.d.slice(5, 7)}</th>
                      <td className="mono">{d.new}</td>
                      <td className="mono">{d.played}</td>
                      <td className="mono">{d.paid}</td>
                      <td className="mono">{d.active}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section className="admin-world" id="sugestoes">
          <header>
            <h2>Sugestões dos jogadores</h2>
            <span className="muted small">{fresh ? `${fresh} nova(s) esperando resposta` : "nenhuma nova"} · concluída avisa todos com crédito; reprovada avisa só quem sugeriu</span>
          </header>
          {Array.isArray(suggestions) ? <AdminSuggestions items={suggestions} /> : <p className="muted small">Não deu para carregar as sugestões: {suggestions}</p>}
        </section>
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
