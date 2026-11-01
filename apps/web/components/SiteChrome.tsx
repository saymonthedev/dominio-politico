import { AUTHOR, authorSite } from "@/lib/author";
import { Icon } from "./Icon";
import { Brand, LogoMark } from "./Logo";

const LINKS: Array<[string, string]> = [
  ["/como-funciona", "Como funciona"],
  ["/manual", "Manual"],
  ["/glossario", "Glossário"],
  ["/fontes", "Fontes"],
];

/** Cabeçalho público; na tela de cadastro, o botão do topo leva para "Entrar" (e vice-versa). */
export function PublicHeader({ loggedIn, page }: { loggedIn: boolean; page?: "entrar" | "cadastro" }) {
  return (
    <header className="masthead">
      <div className="container inner">
        <Brand />
        <span className="spacer" />
        <nav className="top-links" aria-label="Principal">
          {LINKS.map(([href, label]) => (
            <a key={href} className="link" href={href}>{label}</a>
          ))}
        </nav>
        {loggedIn ? (
          <a className="btn gold small" href="/jogo">Jogar</a>
        ) : (
          page === "cadastro" ? (
            <a className="btn gold small" href="/entrar">Entrar</a>
          ) : (
            <>
              {page !== "entrar" && <a className="link hide-sm" href="/entrar">Entrar</a>}
              <a className="btn gold small" href="/cadastro">Criar conta</a>
            </>
          )
        )}
        <details className="mobile-menu">
          <summary aria-label="Abrir menu"><Icon name="menu" size={22} /></summary>
          <div className="mobile-sheet">
            {LINKS.map(([href, label]) => (
              <a key={href} href={href}>{label}</a>
            ))}
            {!loggedIn && <a href="/entrar">Entrar</a>}
          </div>
        </details>
      </div>
    </header>
  );
}

/** Cabeçalho das telas da conta (fora de um mundo). */
export function AppHeader() {
  return (
    <header className="masthead">
      <div className="container inner">
        <Brand href="/jogo" />
        <span className="spacer" />
        <nav className="top-links" aria-label="Conta">
          <a className="link" href="/jogo">Meus mundos</a>
          <a className="link" href="/manual">Manual</a>
          <a className="link" href="/conta">Minha conta</a>
        </nav>
        <form action="/sair" method="post">
          <button className="btn on-dark small">Sair</button>
        </form>
        <details className="mobile-menu">
          <summary aria-label="Abrir menu"><Icon name="menu" size={22} /></summary>
          <div className="mobile-sheet">
            <a href="/jogo">Meus mundos</a>
            <a href="/manual">Manual</a>
            <a href="/conta">Minha conta</a>
          </div>
        </details>
      </div>
    </header>
  );
}

/** Faixa de abertura das páginas (mesmo estilo das páginas de conteúdo). */
export function PageHero({ kicker, title, lede, children }: { kicker?: string; title: React.ReactNode; lede?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className="page-hero">
      <div className="container">
        {kicker && <div className="kicker">{kicker}</div>}
        <h1>{title}</h1>
        {lede && <p className="lede">{lede}</p>}
        {children}
      </div>
    </section>
  );
}

export const DISCLAIMER =
  "Domínio Político é uma simulação fictícia e independente. Não possui vínculo com o TSE, partidos, candidaturas, veículos de comunicação ou instituições retratadas, salvo quando expressamente indicado.";

const FOOTER_COLS: Array<{ title: string; links: Array<[string, string, string]> }> = [
  { title: "O jogo", links: [["/como-funciona", "Como funciona", "play"], ["/manual", "Manual do jogador", "book"], ["/glossario", "Glossário", "search"], ["/partida/2026", "Pontos de partida", "flag"]] },
  { title: "Transparência", links: [["/fontes", "Fontes e licenças", "database"], ["/privacidade", "Privacidade (LGPD)", "lock"], ["/termos", "Termos de uso", "file"]] },
];

const SOURCES: Array<[string, string]> = [
  ["TSE", "Resultados e candidaturas"],
  ["BCB", "Selic, IPCA, câmbio e dívida"],
  ["IBGE", "Malhas e contas nacionais"],
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <a href="/" className="footer-logo" aria-label="Domínio Político, página inicial">
              <LogoMark size={46} />
              <span>
                <b>Domínio <span>Político</span></b>
                <small>Simulador de carreira política</small>
              </span>
            </a>
            <p>Do bairro ao Planalto num Brasil que começa real e segue simulado. Partidos e eleitos de verdade no ponto de partida; o futuro é com você.</p>
            <div className="footer-legend">
              <span className="badge real">Fato real</span>
              <span className="badge sim">Simulação</span>
              <span className="footer-legend__txt">Toda notícia indica de onde vem.</span>
            </div>
            <div className="footer-author">
              <span className="footer-author__mark" aria-hidden="true">
                {AUTHOR.initials}
              </span>
              <span className="footer-author__who">
                <small>Criado por</small>
                <b>{AUTHOR.name}</b>
              </span>
              <span className="footer-author__links">
                <a href={authorSite("rodape")} target="_blank" rel="noopener" aria-label={`Site de ${AUTHOR.name}: ${AUTHOR.siteLabel} (abre em nova aba)`}>
                  <Icon name="globe" size={15} /> {AUTHOR.siteLabel}
                </a>
                <a href={AUTHOR.instagram} target="_blank" rel="noopener" aria-label={`Instagram de ${AUTHOR.name}: ${AUTHOR.handle} (abre em nova aba)`}>
                  <Icon name="instagram" size={15} /> {AUTHOR.handle}
                </a>
              </span>
            </div>
          </div>
          {FOOTER_COLS.map((c) => (
            <nav key={c.title} className="footer-col" aria-label={c.title}>
              <div className="footer-col__title">{c.title}</div>
              {c.links.map(([href, label, icon]) => (
                <a key={href} href={href}>
                  <Icon name={icon} size={16} /> {label}
                </a>
              ))}
            </nav>
          ))}
          <div className="footer-col">
            <div className="footer-col__title">Dados reais</div>
            <div className="footer-sources">
              {SOURCES.map(([name, what]) => (
                <div key={name} className="footer-source">
                  <span className="footer-source__mark">{name}</span>
                  <span>{what}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span className="rating" title="Classificação indicativa: não recomendado para menores de 16 anos">16</span>
          <p>{DISCLAIMER} Pessoas reais nunca recebem crimes, falas ou condições de saúde inventadas.</p>
          <span className="footer-copy">
            © {new Date().getFullYear()} Domínio Político · por{" "}
            <a href={AUTHOR.instagram} target="_blank" rel="noopener">
              {AUTHOR.handle}
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
