"use client";
import { useEffect, useState } from "react";

const BUILD = process.env.NEXT_PUBLIC_BUILD ?? "dev";

/** Algo acontecendo na tela (relógio rodando, pop-up aberto): não recarrega no meio. */
const busy = () => !!document.querySelector(".tm.is-live, .ev-overlay, .pr-overlay, .ui-overlay");

/**
 * Depois de uma atualização do site, a aba aberta ainda roda a versão antiga e
 * pode quebrar ao misturar as duas. Ao voltar para a aba, recarrega sozinha;
 * com algo acontecendo na tela, mostra um aviso para atualizar.
 */
export function VersionWatch() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    if (BUILD === "dev") return;
    let last = 0;
    const check = async () => {
      if (Date.now() - last < 60_000) return;
      last = Date.now();
      try {
        const r = await fetch("/api/versao", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (v && v !== BUILD) {
          if (document.visibilityState === "visible" && !busy()) window.location.reload();
          else setStale(true);
        }
      } catch {
        /* sem rede: tenta depois */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    const t = window.setInterval(check, 5 * 60_000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.clearInterval(t);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="vwatch" role="status">
      <span>Saiu uma versão nova do jogo.</span>
      <button type="button" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </div>
  );
}
