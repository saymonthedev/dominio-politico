import { PublicHeader, Footer } from "@/components/SiteChrome";
import { currentUser } from "@/lib/supabase/server";
import { START_POINTS } from "@/lib/startpoints";

const pct = (v: number) => v.toFixed(2).replace(".", ",");

export default async function Home() {
  const { user } = await currentUser();
  const latest = START_POINTS[START_POINTS.length - 1];
  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <section className="hero">
        <div className="container inner">
          <div>
            <div className="kicker">Simulador persistente · Brasil real · 2002 → 2100</div>
            <h1>
              Comece como cidadão. <em>Chegue ao Planalto</em> — ou caia no escândalo.
            </h1>
            <p className="lede">
              Escolha o dia seguinte a uma eleição presidencial real e entre num país vivo: partidos de verdade, eleitos de verdade, economia de verdade. Daí em
              diante, a história é sua — e do mundo, que continua andando mesmo quando você sai.
            </p>
            <div className="cta">
              <a className="btn gold" href={user ? "/jogo" : "/cadastro"}>Começar minha carreira</a>
              <a className="btn on-dark" href="/como-funciona">Como funciona</a>
            </div>
          </div>
          <div className="frontpage" aria-hidden="true">
            <div className="flag">
              Folha do Planalto <small>edição de {latest.date.split("-").reverse().join("/")}</small>
            </div>
            <div className="news lead" style={{ borderBottom: "1px solid var(--linha)" }}>
              <div className="meta">
                <span className="badge real">Fato real · TSE</span>
              </div>
              <h3 style={{ fontSize: "1.45rem" }}>
                {latest.winner} vence o 2º turno com {pct(latest.winnerShare)}% dos válidos
              </h3>
              <p style={{ fontSize: ".95rem" }}>A partir daqui, a linha do tempo é simulada. Partidos já recalculam 2028.</p>
            </div>
            <div className="news">
              <div className="meta">
                <span className="badge sim">Simulação</span>
              </div>
              <h3 style={{ fontSize: "1.05rem" }}>Diretório estadual analisa seu pedido de filiação</h3>
            </div>
            <div className="news">
              <div className="meta">
                <span className="badge bad">Investigação</span>
              </div>
              <h3 style={{ fontSize: "1.05rem" }}>Operação da PF mira esquema de caixa dois em capital do Nordeste</h3>
            </div>
          </div>
        </div>
      </section>

      <main className="container">
        <div className="rule-title">
          <h2>Escolha seu ponto de partida</h2>
          <span className="muted">Sempre o dia seguinte a um 2º turno presidencial</span>
        </div>
        <div className="timeline">
          {START_POINTS.map((s) => (
            <a key={s.year} className="startpoint" href={user ? `/jogo/novo?ano=${s.year}` : `/cadastro?ano=${s.year}`}>
              <span className="year">{s.year}</span>
              <span>
                <b>{s.winner}</b> <span className="muted">({s.winnerParty})</span>
              </span>
              <span className="who mono">
                {pct(s.winnerShare)}% × {s.rival} {pct(s.rivalShare)}%
              </span>
              <span className="who">Em exercício: {s.incumbent}</span>
            </a>
          ))}
        </div>

        <div className="grid grid-3 mt-lg">
          <div className="card">
            <span className="label">Carreira</span>
            <h3 className="mt">Do bairro ao Planalto</h3>
            <p className="muted">
              Cidadão, ativista, filiado, quadro, pré-candidato, candidato, eleito. Cada partido tem sua cultura: alguns abrem a porta, outros só aceitam quem
              tem padrinho.
            </p>
          </div>
          <div className="card">
            <span className="label">Mundo vivo</span>
            <h3 className="mt">O país não espera você</h3>
            <p className="muted">
              Copom decide juros, a economia oscila, bancadas trocam de partido na janela, eleições acontecem a cada dois anos — com pesquisas, debates e 2º
              turno.
            </p>
          </div>
          <div className="card">
            <span className="label">Risco e evidência</span>
            <h3 className="mt">Crime tem rastro</h3>
            <p className="muted">
              Caixa dois e propina rendem dinheiro — e deixam testemunhas. Monte dossiês, acione a PF ou o MP, abra CPI, faça delação. Partidos ficam sujos
              pelo que seus membros fazem.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
