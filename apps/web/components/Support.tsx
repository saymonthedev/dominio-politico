"use client";
export type { PixInfo } from "./SupportDialog";

/** Evento que abre a caixa de apoio de qualquer botão do jogo (quem escuta é o Announcements). */
export const OPEN_SUPPORT = "dp:apoiar";

export function openSupport(): void {
  window.dispatchEvent(new Event(OPEN_SUPPORT));
}

/** Botão do jogo: pede ao Announcements (montado no layout) para abrir a caixa de apoio. */
export function SupportTrigger({ className, children, role }: { className?: string; children: React.ReactNode; role?: string }) {
  return (
    <button type="button" className={className} onClick={openSupport} aria-haspopup="dialog" role={role}>
      {children}
    </button>
  );
}
