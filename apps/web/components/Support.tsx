"use client";
import { Icon } from "./Icon";
export type { PixInfo } from "./SupportDialog";

/** Evento que abre a caixa de apoio de qualquer botão do jogo (quem escuta é o Announcements). */
export const OPEN_SUPPORT = "dp:apoiar";

export function openSupport(): void {
  window.dispatchEvent(new Event(OPEN_SUPPORT));
}

/** Botão do jogo: pede ao Announcements (montado no layout) para abrir a caixa de apoio. */
export function SupportTrigger({ className, children, role, label }: { className?: string; children: React.ReactNode; role?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={openSupport} aria-haspopup="dialog" role={role} aria-label={label} title={label}>
      {children}
    </button>
  );
}

/** Botão fixo do topo do jogo: sempre à vista e sem chamar atenção (em celular pequeno, o convite fica no menu "Mais"). */
export function SupportTopButton() {
  return (
    <SupportTrigger className="topbtn topbtn--support" label="Apoiar o jogo com Pix">
      <Icon name="heart" size={17} />
      <span>Apoiar</span>
    </SupportTrigger>
  );
}

/** Convite parado (sem pop-up): no fim do menu do jogo e na tela de mundos. */
export function SupportCard({ variant = "side" }: { variant?: "side" | "wide" }) {
  const wide = variant === "wide";
  return (
    <aside className={`supcard supcard--${variant}`} aria-label="Apoie o jogo">
      <span className="supcard__icon" aria-hidden="true">
        <Icon name="heart" size={wide ? 20 : 16} />
      </span>
      <span className="supcard__text">
        <b>{wide ? "Curtindo o Domínio Político?" : "Gosta do jogo?"}</b>
        <span>{wide ? "O jogo é grátis e feito por uma pessoa só. Um Pix de qualquer valor ajuda a manter o servidor no ar." : "Ele é grátis e feito por uma pessoa só. Qualquer valor ajuda a manter o servidor."}</span>
      </span>
      <SupportTrigger className="supcard__btn">
        <Icon name="heart" size={14} /> Apoiar com Pix
      </SupportTrigger>
    </aside>
  );
}
