"use client";
import { useEffect } from "react";

/** Rola suavemente até uma parte da página e a destaca, sem "pulo". */
export function scrollToHash(hash: string): boolean {
  const el = document.getElementById(hash);
  if (!el) return false;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  history.replaceState(null, "", `#${hash}`);
  el.classList.remove("is-flash");
  void el.offsetWidth;
  el.classList.add("is-flash");
  window.setTimeout(() => el.classList.remove("is-flash"), 1600);
  el.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true });
  return true;
}

const same = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

/**
 * Links para uma âncora da própria página (ex.: "Passar o tempo" → #tempo) rolam suavemente
 * e destacam o destino; vindo de outra página, o destino é destacado na chegada.
 */
export function HashScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href*='#']") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      const hash = url.hash.slice(1);
      if (!hash || url.origin !== window.location.origin || !same(url.pathname, window.location.pathname)) return;
      if (scrollToHash(decodeURIComponent(hash))) e.preventDefault();
    };
    // captura: chega antes do Link do Next, que respeita o preventDefault
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    // chegando de outra página já na âncora: só destaca o destino
    const el = window.location.hash ? document.getElementById(decodeURIComponent(window.location.hash.slice(1))) : null;
    if (!el) return;
    el.classList.add("is-flash");
    const t = window.setTimeout(() => el.classList.remove("is-flash"), 1600);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
