"use client";
import { useEffect } from "react";
import { recoverOnce } from "@/components/recover";

/** Último recurso: algo quebrou antes da página montar (ex.: versão do site trocada no meio). */
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    recoverOnce(error);
  }, [error]);
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#0b1f3a", color: "#fff", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.4rem", margin: "0 0 8px" }}>Algo saiu do lugar</h1>
          <p style={{ opacity: 0.8, lineHeight: 1.5, margin: "0 0 20px" }}>Provavelmente o site foi atualizado enquanto a página estava aberta. Recarregar resolve.</p>
          <button type="button" onClick={() => window.location.reload()} style={{ background: "#d4a53c", color: "#0b1f3a", border: 0, borderRadius: 12, padding: "12px 20px", fontWeight: 700, cursor: "pointer" }}>
            Recarregar
          </button>{" "}
          <button type="button" onClick={reset} style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,.3)", borderRadius: 12, padding: "12px 20px", cursor: "pointer" }}>
            Tentar de novo
          </button>
        </div>
      </body>
    </html>
  );
}
