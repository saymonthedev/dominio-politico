"use client";
import { useEffect, useState } from "react";
import type { LiveVitals } from "@/lib/vitals";

const EVENT = "dp:vitals";

/** Avisa a barra lateral e a faixa do celular dos números novos (depois de uma decisão ou de um trecho de dias). */
export function publishVitals(v: LiveVitals | null | undefined): void {
  if (!v || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LiveVitals>(EVENT, { detail: v }));
}

/**
 * Números mais recentes publicados pelo relógio e pelas decisões. Quando a página recarrega
 * (props novas do servidor, identificadas por `serverKey`), volta a valer o que veio de lá.
 */
export function useLiveVitals(serverKey: unknown): LiveVitals | null {
  const [live, setLive] = useState<LiveVitals | null>(null);
  useEffect(() => {
    const on = (e: Event) => setLive((e as CustomEvent<LiveVitals>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => setLive(null), [serverKey]);
  return live;
}
