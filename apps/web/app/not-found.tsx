import type { Metadata } from "next";
import { Icon } from "@/components/Icon";
import { AuthLink } from "@/components/AuthAware";
import { Footer, PublicHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Página não encontrada", robots: { index: false } };

/** Qualquer endereço que não existe cai aqui, no visual do jogo. */
export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main className="nf">
        <div className="container nf__inner">
          <div className="nf__ballot" aria-hidden="true">
            <span className="nf__code mono">404</span>
            <span className="nf__stamp">Indeferida</span>
          </div>
          <div className="nf__text">
            <div className="kicker">Erro 404 · página não encontrada</div>
            <h1>
              Esta página não passou <em>na convenção.</em>
            </h1>
            <p className="lede">
              O endereço pode ter mudado, renunciado antes da posse ou nunca ter sido registrado. Confira o link ou volte para um lugar seguro.
            </p>
            <div className="cta">
              <AuthLink
                className="btn gold"
                href="/"
                authHref="/jogo"
                authChildren={
                  <>
                    Voltar aos meus mundos <Icon name="arrow" size={18} />
                  </>
                }
              >
                Ir para o início <Icon name="arrow" size={18} />
              </AuthLink>
              <a className="btn on-dark" href="/manual">
                Manual do jogador
              </a>
            </div>
            <nav className="nf__links" aria-label="Outros caminhos">
              <a href="/como-funciona">Como funciona</a>
              <a href="/partida/2026">Pontos de partida</a>
              <a href="/glossario">Glossário</a>
            </nav>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
