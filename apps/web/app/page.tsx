import { profileFor, UFS } from "@dp/engine";
import { ElectionMap, type MapYear } from "@/components/ElectionMap";
import { Icon } from "@/components/Icon";
import { Footer, PublicHeader } from "@/components/SiteChrome";
import { StartTrack } from "@/components/StartTrack";
import { brazilUfPaths } from "@/lib/geo-paths";
import { START_POINTS } from "@/lib/startpoints";
import { currentUser } from "@/lib/supabase/server";

const pct = (v: number) => v.toFixed(2).replace(".", ",");

const STEPS = [
  {
    icon: "flag",
    title: "Escolha o ponto de partida",
    text: "O dia seguinte a um 2º turno presidencial real, de 2002 a 2026. Cada ano é um mundo próprio, com os eleitos, partidos e economia daquele momento.",
  },
  {
    icon: "users",
    title: "Crie seu político",
    text: "Você começa como cidadão comum, em um estado e uma cidade de verdade. Milite, filie-se, construa base e dispute a primeira eleição.",
  },
  {
    icon: "clock",
    title: "Deixe o país andar",
    text: "O tempo passa sozinho ou quando você avança 1, 7 ou 15 dias. Copom, pesquisas, CPIs e janelas partidárias acontecem com ou sem você.",
  },
];

const FEATURES = [
  { icon: "ballot", title: "Eleições completas", text: "Convenções, fundo eleitoral, pesquisas com margem de erro, debates, 2º turno, quociente e sobras na Câmara." },
  { icon: "landmark", title: "Partidos reais", text: "Os partidos registrados no TSE em cada ano, com bancadas e lideranças reais no ponto de partida e culturas internas distintas." },
  { icon: "chart", title: "Economia viva", text: "PIB, inflação, Selic, câmbio e desemprego a partir das séries do Banco Central, reagindo às políticas do governo." },
  { icon: "gavel", title: "Crime deixa rastro", hot: true, text: "Caixa dois e propina rendem dinheiro e testemunhas. Monte dossiês, acione PF ou MP, abra CPI, negocie delação." },
  { icon: "map", title: "O Brasil de verdade", text: "Mapa real dos 27 estados e 5.570 municípios, com resultados oficiais por estado em cada eleição de partida." },
  { icon: "shield", title: "Fato e ficção separados", text: "Toda notícia diz se é fato real (com fonte) ou simulação. Pessoas reais nunca recebem crimes ou falas inventadas." },
];

export default async function Home() {
  const { user } = await currentUser();
  const latest = START_POINTS[START_POINTS.length - 1];
  const paths = brazilUfPaths(600, 620);
  const years: MapYear[] = START_POINTS.map((s) => {
    const parties = new Set([s.winnerParty, s.rivalParty, ...Object.values(s.ufResults).map((r) => r.party)]);
    return {
      year: s.year,
      winner: s.winner,
      winnerParty: s.winnerParty,
      rival: s.rival,
      rivalParty: s.rivalParty,
      colors: Object.fromEntries([...parties].map((p) => [p, profileFor(p, s.year).color])),
      ufResults: s.ufResults,
    };
  });
  const startHref = (year?: number) => (user ? (year ? `/jogo/novo?ano=${year}` : "/jogo") : year ? `/cadastro?ano=${year}` : "/cadastro");

  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <section className="home-hero">
        <div className="container inner">
          <div>
            <div className="section-kicker">Simulador político persistente · Brasil real</div>
            <h1>
              Do bairro ao <em>Planalto</em>.
              <br />
              Ou ao escândalo.
            </h1>
            <p className="lede">
              Entre no Brasil do dia seguinte a uma eleição presidencial real, com partidos, eleitos e economia de verdade. A partir dali, a história é
              simulada, e o país continua andando mesmo quando você sai.
            </p>
            <div className="cta">
              <a className="btn gold" href={startHref()}>
                Começar minha carreira <Icon name="arrow" size={18} />
              </a>
              <a className="btn on-dark" href="/como-funciona">Como funciona</a>
            </div>
            <div className="hero-facts">
              <div>
                <b>{START_POINTS.length}</b>
                <span>pontos de partida</span>
              </div>
              <div>
                <b>{latest.parties}</b>
                <span>partidos em {latest.year}</span>
              </div>
              <div>
                <b>{(latest.electorate / 1e6).toFixed(0)} mi</b>
                <span>eleitores em {latest.year}</span>
              </div>
            </div>
          </div>
          <ElectionMap paths={paths} years={years} initial={latest.year} ufNames={Object.fromEntries(UFS.map((u) => [u.code, u.name]))} />
        </div>
      </section>

      <section className="home-section">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Como funciona</div>
            <h2>Três passos para entrar na política</h2>
            <p>Sem tutorial longo: você aprende jogando, e o manual está sempre a um clique.</p>
          </div>
          <div className="steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="step">
                <span className="n">PASSO {String(i + 1).padStart(2, "0")}</span>
                <div className="ico">
                  <Icon name={s.icon} size={22} />
                </div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="home-section alt">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">Pontos de partida</div>
            <h2>Escolha em que Brasil você começa</h2>
            <p>Sempre o dia seguinte ao 2º turno presidencial, com o resultado oficial do TSE. Cada ano tem um mundo compartilhado, e você também pode jogar num mundo só seu.</p>
          </div>
          <StartTrack hrefFor={(y) => startHref(y)} />
          <nav className="sp-years sp-years--home" aria-label="Conheça cada ponto de partida">
            <span className="muted small">Conheça cada um:</span>
            {START_POINTS.map((s) => (
              <a key={s.year} href={`/partida/${s.year}`}>
                {s.year}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="home-section">
        <div className="container">
          <div className="section-head">
            <div className="section-kicker">O mundo</div>
            <h2>Um país que reage</h2>
            <p>O motor decide o que acontece com regras e sorteios reprodutíveis. O texto só narra.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <div key={f.title} className={`feature${f.hot ? " hot" : ""}`}>
                <div className="ico">
                  <Icon name={f.icon} size={22} />
                </div>
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 72 }}>
        <div className="cta-band">
          <div>
            <h2>A próxima eleição já está no calendário.</h2>
            <p>Crie sua conta, escolha o ano e comece como cidadão. Gratuito, 16+.</p>
          </div>
          <a className="btn" href={startHref()}>
            {user ? "Ir para meus mundos" : "Criar conta grátis"}
          </a>
        </div>
      </section>
      <Footer />
    </>
  );
}
