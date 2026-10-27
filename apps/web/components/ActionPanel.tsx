"use client";
import { useActionState } from "react";
import { doAction, type ActionState } from "@/app/jogo/actions";
import type { ActionView } from "@/lib/actions-view";

const CAT: Record<string, { icon: string; cls: string }> = {
  BASE: { icon: "◆", cls: "" },
  PARTIDO: { icon: "▲", cls: "" },
  CAMPANHA: { icon: "★", cls: "campanha" },
  MANDATO: { icon: "§", cls: "" },
  INVESTIGACAO: { icon: "⚖", cls: "crime" },
};

function ActionForm({ year, a }: { year: number; a: ActionView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(doAction, { ok: true, message: "" });
  const disabled = !!a.reason;
  return (
    <details className="action" data-disabled={disabled}>
      <summary>
        <span className={`cat-icon ${CAT[a.category]?.cls ?? ""}`} aria-hidden="true">{CAT[a.category]?.icon}</span>
        <span className="title">{a.label}</span>
        <span className="cost">
          {a.energy ? `⚡${a.energy}` : ""}
          {a.cost ? ` · R$ ${a.cost.toLocaleString("pt-BR")}` : ""}
        </span>
      </summary>
      <div className="body">
        <p className="desc">{a.description}</p>
        {disabled ? (
          <div className="form-msg err">{a.reason}</div>
        ) : (
          <form action={action}>
            <input type="hidden" name="__year" value={year} />
            <input type="hidden" name="__action" value={a.id} />
            {a.params.map((p) => (
              <div key={p.name}>
                <label htmlFor={`${a.id}-${p.name}`}>
                  {p.label}
                  {p.optional ? " (opcional)" : ""}
                </label>
                {p.options ? (
                  <select id={`${a.id}-${p.name}`} name={p.name} required={!p.optional} defaultValue="">
                    <option value="" disabled={!p.optional}>
                      {p.options.length ? "Escolha…" : "Nenhuma opção disponível"}
                    </option>
                    {p.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input id={`${a.id}-${p.name}`} name={p.name} type={p.type === "number" ? "number" : "text"} required={!p.optional} maxLength={90} />
                )}
              </div>
            ))}
            <button className="btn mt" disabled={pending}>
              {pending ? "Executando…" : "Executar"}
            </button>
            {state.message && <div className={`form-msg ${state.ok ? "ok" : "err"}`}>{state.message}</div>}
          </form>
        )}
      </div>
    </details>
  );
}

export function ActionPanel({ year, actions, empty }: { year: number; actions: ActionView[]; empty?: string }) {
  if (!actions.length) return <div className="empty">{empty ?? "Nenhuma ação nesta categoria."}</div>;
  const sorted = [...actions].sort((x, y) => Number(!!x.reason) - Number(!!y.reason));
  return (
    <div className="actions">
      {sorted.map((a) => (
        <ActionForm key={a.id} year={year} a={a} />
      ))}
    </div>
  );
}
