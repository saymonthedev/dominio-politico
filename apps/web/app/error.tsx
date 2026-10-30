"use client";
import { useEffect } from "react";
import { recoverOnce } from "@/components/recover";

/** Erro numa tela: oferece recarregar em vez de derrubar o site inteiro. */
export default function RouteError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    recoverOnce(error);
  }, [error]);
  return (
    <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>Algo saiu do lugar</h1>
        <p className="muted" style={{ lineHeight: 1.5, margin: "0 0 20px" }}>Não foi possível mostrar esta tela. Se o site acabou de ser atualizado, recarregar resolve.</p>
        <button type="button" className="ui-btn ui-btn--gold" onClick={() => window.location.reload()}>
          <span>Recarregar</span>
        </button>{" "}
        <button type="button" className="ui-btn ui-btn--ghost" onClick={reset}>
          <span>Tentar de novo</span>
        </button>
      </div>
    </div>
  );
}
