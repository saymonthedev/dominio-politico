import { Brand } from "./Logo";

export function PublicHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="masthead">
      <div className="container inner">
        <Brand />
        <span className="spacer" />
        <a className="link" href="/como-funciona">Como funciona</a>
        <a className="link" href="/manual">Manual</a>
        {loggedIn ? (
          <a className="btn gold small" href="/jogo">Jogar</a>
        ) : (
          <>
            <a className="link" href="/entrar">Entrar</a>
            <a className="btn gold small" href="/cadastro">Criar conta</a>
          </>
        )}
      </div>
    </header>
  );
}

export const DISCLAIMER =
  "Domínio Político é uma simulação fictícia e independente. Não possui vínculo com o TSE, partidos, candidaturas, veículos de comunicação ou instituições retratadas, salvo quando expressamente indicado.";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <p>{DISCLAIMER}</p>
        <p>
          Dados reais do snapshot: TSE (resultados e candidaturas, CC-BY), Banco Central (SGS) e IBGE. Tudo após a data do ponto de partida é linha do tempo
          simulada. Pessoas reais nunca são acusadas de crimes inventados.
        </p>
        <p className="row">
          <a href="/como-funciona">Como funciona</a> · <a href="/manual">Manual</a> · <a href="/glossario">Glossário</a> · <a href="/fontes">Fontes</a> ·{" "}
          <a href="/privacidade">Privacidade</a> · <a href="/termos">Termos</a> · <span>Classificação indicativa: 16+</span>
        </p>
      </div>
    </footer>
  );
}
