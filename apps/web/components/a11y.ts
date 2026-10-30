"use client";
import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Controles focáveis e visíveis dentro de um elemento, na ordem do documento. */
export function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && el.getAttribute("aria-hidden") !== "true" && !el.classList.contains("ui-sr"));
}

/**
 * Diálogo modal: ao abrir, foca o controle indicado (ou o primeiro); o Tab fica
 * preso dentro dele; Esc fecha; ao fechar, o foco volta para quem abriu.
 */
export function useModal(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, opts: { initial?: string; lockScroll?: boolean } = {}): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = ref.current;
    const first = (opts.initial ? root?.querySelector<HTMLElement>(opts.initial) : null) ?? (root ? focusablesIn(root)[0] : null) ?? root;
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab" || !root) return;
      const items = focusablesIn(root);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === head || !root.contains(at))) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && (at === tail || !root.contains(at))) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    if (opts.lockScroll) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opts.lockScroll) document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Painel suspenso (menu, sino, "Mais"): Esc fecha e devolve o foco ao botão;
 * clicar fora ou sair com o Tab também fecha. Em menus, ↑ ↓ Home End percorrem os itens.
 */
export function usePopover(
  box: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  opts: { trigger?: RefObject<HTMLElement | null>; menu?: boolean; focusFirst?: boolean } = {},
): void {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const root = box.current;
    const items = () => (root ? focusablesIn(root).filter((el) => el !== opts.trigger?.current) : []);
    if (opts.focusFirst) items()[0]?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent) => {
      if (!root?.contains(e.target as Node)) close.current();
    };
    const onFocus = (e: FocusEvent) => {
      if (root && e.target instanceof Node && !root.contains(e.target)) close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        opts.trigger?.current?.focus();
        return;
      }
      if (!opts.menu) return;
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement as HTMLElement);
      const go = (n: number) => {
        e.preventDefault();
        list[(n + list.length) % list.length]?.focus();
      };
      if (e.key === "ArrowDown") go(i + 1);
      else if (e.key === "ArrowUp") go(i < 0 ? list.length - 1 : i - 1);
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(list.length - 1);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}

/**
 * Fechar clicando no fundo escuro só quando o clique começa e termina nele
 * (rolar a tela ou arrastar uma seleção até a borda não fecha o pop-up).
 */
export function backdropClose(onClose: () => void) {
  let down = false;
  return {
    onPointerDown: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      down = e.target === e.currentTarget;
    },
    onClick: (e: { target: EventTarget; currentTarget: EventTarget }) => {
      if (down && e.target === e.currentTarget) onClose();
      down = false;
    },
  };
}
