"use client";
import { useEffect, useRef, useState } from "react";
import { scrollToHash } from "./HashScroll";

const TABS = [
  { id: "agir", label: "Agir" },
  { id: "hist", label: "Histórico" },
  { id: "perfil", label: "Perfil" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const groupOf = (el: Element | null | undefined): Tab | null =>
  el?.closest(".cg-hist") ? "hist" : el?.closest(".cg-perfil") ? "perfil" : el?.closest(".cg-agir") ? "agir" : null;

/**
 * No celular a Carreira vira três abas (agir, histórico e perfil): numa coluna só, a
 * página passava de 9 mil pixels e as ações se perdiam no meio do histórico. Na tela
 * larga as abas somem e tudo continua lado a lado. Cada painel diz a qual aba pertence
 * com a classe cg-agir, cg-hist ou cg-perfil.
 */
export function CareerTabs({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>("agir");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // um link para uma âncora (ex.: #historia) abre a aba dela antes de rolar até lá
    const onReveal = (e: Event) => {
      const g = groupOf((e as CustomEvent<Element>).detail);
      if (!g || !box.current) return;
      box.current.dataset.tab = g; // já na hora: a rolagem vem logo em seguida
      setTab(g);
    };
    const fromHash = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      // na tela larga não há abas: o navegador já rolou até a âncora
      if (!window.matchMedia("(max-width: 1000px)").matches) return;
      if (el && groupOf(el) && groupOf(el) !== box.current?.dataset.tab) scrollToHash(id);
    };
    window.addEventListener("dp:reveal", onReveal);
    window.addEventListener("hashchange", fromHash);
    fromHash();
    return () => {
      window.removeEventListener("dp:reveal", onReveal);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  return (
    <div className="ctabs" data-tab={tab} ref={box}>
      <div className="seg ctabs__seg" role="group" aria-label="Partes da carreira">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? "on" : ""} aria-pressed={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
