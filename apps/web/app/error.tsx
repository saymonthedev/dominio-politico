"use client";
import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { recoverOnce } from "@/components/recover";

const KEY = "dp:tentativas";
/** tentativas automáticas por tela, num intervalo curto (depois disso, só pelo botão) */
const AUTO_TRIES = 2;

/** Erro numa tela: tenta de novo sozinho (servidor ocupado costuma passar em segundos) e oferece recarregar. */
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const [auto, setAuto] = useState(false);

  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    recoverOnce(error);
    let tries: Record<string, { n: number; at: number }> = {};
    try {
      tries = JSON.parse(sessionStorage.getItem(KEY) ?? "{}");
    } catch {
      tries = {};
    }
    const path = window.location.pathname;
    const cur = tries[path] && Date.now() - tries[path].at < 120_000 ? tries[path] : { n: 0, at: Date.now() };
    if (cur.n >= AUTO_TRIES) return;
    tries[path] = { n: cur.n + 1, at: cur.at };
    try {
      sessionStorage.setItem(KEY, JSON.stringify(tries));
    } catch {
      return;
    }
    setAuto(true);
    const t = window.setTimeout(retry, 2500 + cur.n * 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }} role="status" aria-live="polite">
        <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>{auto ? "Só um instante" : "Algo saiu do lugar"}</h1>
        <p className="muted" style={{ lineHeight: 1.5, margin: "0 0 20px" }}>
          {auto
            ? "O servidor demorou para montar esta tela. Tentando de novo sozinho…"
            : "Não foi possível mostrar esta tela. Se o site acabou de ser atualizado, recarregar resolve."}
        </p>
        <button type="button" className="ui-btn ui-btn--gold" onClick={() => window.location.reload()}>
          <span>Recarregar</span>
        </button>{" "}
        <button type="button" className="ui-btn ui-btn--ghost" onClick={retry}>
          <span>Tentar de novo</span>
        </button>
      </div>
    </div>
  );
}
