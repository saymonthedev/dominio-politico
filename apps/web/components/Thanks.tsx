import { Icon } from "./Icon";

/**
 * Agradecimento no lugar do antigo convite para apoiar com Pix: no fim do menu do jogo e na tela de
 * mundos. Para quem assina, agradece a assinatura e mostra até quando ela vale.
 */
export function ThanksCard({ variant = "side", until }: { variant?: "side" | "wide"; until?: string | null }) {
  const wide = variant === "wide";
  return (
    <aside className={`thanks thanks--${variant}`} aria-label="Obrigado">
      <span className="thanks__icon" aria-hidden="true">
        <Icon name="heart" size={wide ? 20 : 16} />
      </span>
      <span className="thanks__text">
        <b>{until ? (wide ? "Obrigado por apoiar o Domínio Político!" : "Obrigado por apoiar o jogo!") : "Obrigado por jogar o Domínio Político!"}</b>
        <span>
          {until
            ? wide
              ? "É a sua assinatura que mantém os servidores no ar e o jogo crescendo, feito por uma pessoa só."
              : "Sua assinatura mantém o jogo no ar."
            : wide
              ? "O jogo é feito por uma pessoa só, e cada partida jogada ajuda ele a crescer."
              : "Cada partida ajuda o jogo a crescer."}
        </span>
        {until && (
          <span>
            Assinatura até {until}. <a href="/assinar">Ver ou renovar</a>
          </span>
        )}
      </span>
    </aside>
  );
}
