"use client";
import { useState } from "react";
import { QuickAction } from "./QuickAction";

/**
 * Aceitar ou recusar um convite de filiação. Depois da resposta, os botões
 * somem na hora, mesmo em telas que não são recarregadas (como o resumo do período).
 */
export function InviteActions({ year, invite, className }: { year: number; invite: string; className: string }) {
  const [answer, setAnswer] = useState<"ACEITAR" | "RECUSAR" | null>(null);
  if (answer) return <small className="muted">{answer === "ACEITAR" ? "Convite aceito." : "Convite recusado."}</small>;
  const done = (decision: "ACEITAR" | "RECUSAR") => (ok: boolean) => ok && setAnswer(decision);
  return (
    <div className={className}>
      <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "ACEITAR" }} label="Aceitar filiação" tone="gold" icon="check" onDone={done("ACEITAR")} />
      <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "RECUSAR" }} label="Recusar" tone="ghost" onDone={done("RECUSAR")} />
    </div>
  );
}
