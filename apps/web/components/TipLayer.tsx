"use client";
import { useEffect, useState } from "react";

interface Tip {
  text: string;
  x: number;
  y: number;
  below: boolean;
}

/**
 * Dicas do jogo no lugar das do navegador. Qualquer elemento com `title` (ou `data-tip`)
 * ganha um balão no visual do jogo ao parar o mouse ou focar pelo teclado; o `title` é
 * retirado na hora (antes do atraso do navegador), então a dica nativa nunca aparece.
 * Se o elemento não tinha nome acessível, o texto da dica vira o nome (leitores de tela).
 */
export function TipLayer() {
  const [tip, setTip] = useState<Tip | null>(null);

  useEffect(() => {
    let timer = 0;
    let current: Element | null = null;
    const find = (t: EventTarget | null) => (t instanceof Element ? t.closest("[title], [data-tip]") : null);
    const prepare = (el: Element): string | null => {
      const t = el.getAttribute("title");
      if (t != null) {
        el.removeAttribute("title");
        if (t.trim()) el.setAttribute("data-tip", t);
        if (t.trim() && !el.getAttribute("aria-label") && !(el.textContent ?? "").trim()) el.setAttribute("aria-label", t);
      }
      return el.getAttribute("data-tip");
    };
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    const show = (el: Element, delay: number) => {
      const text = prepare(el);
      if (!text) return;
      current = el;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        const below = r.top < 70;
        const half = Math.min(150, (window.innerWidth - 24) / 2);
        const x = Math.max(12 + half, Math.min(window.innerWidth - 12 - half, r.left + r.width / 2));
        setTip({ text, x, y: below ? r.bottom + 8 : r.top - 8, below });
      }, delay);
    };
    const over = (e: PointerEvent) => {
      // no toque não há "passar o mouse": a dica só atrapalharia o toque
      if (e.pointerType === "touch") {
        const el = find(e.target);
        if (el) prepare(el);
        return;
      }
      const el = find(e.target);
      if (el && el !== current) show(el, 350);
      else if (!el && current) hide();
    };
    const out = (e: PointerEvent) => {
      if (!current) return;
      const to = e.relatedTarget as Node | null;
      if (to && current.contains(to)) return;
      hide();
    };
    const focus = (e: FocusEvent) => {
      const el = find(e.target);
      if (el && (e.target as Element).matches?.(":focus-visible")) show(el, 150);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("pointerover", over, true);
    document.addEventListener("pointerout", out, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("pointerout", out, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", hide, true);
      window.clearTimeout(timer);
    };
  }, []);

  if (!tip) return null;
  return (
    <div className={`tip${tip.below ? " is-below" : ""}`} role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );
}
