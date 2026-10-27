"use client";
import { useActionState, useId, useState } from "react";
import { doAction, type ActionState } from "@/app/jogo/actions";
import type { ActionView } from "@/lib/actions-view";
import { FormMessage, Select, SubmitButton, TextField } from "./forms";
import { Icon } from "./Icon";

const CAT: Record<string, { icon: string; cls: string }> = {
  BASE: { icon: "users", cls: "" },
  PARTIDO: { icon: "landmark", cls: "" },
  CAMPANHA: { icon: "megaphone", cls: "campanha" },
  MANDATO: { icon: "scale", cls: "" },
  INVESTIGACAO: { icon: "search", cls: "crime" },
};

function ActionItem({ year, a }: { year: number; a: ActionView }) {
  const [state, action] = useActionState<ActionState, FormData>(doAction, { ok: true, message: "" });
  const [open, setOpen] = useState(false);
  const id = useId();
  const disabled = !!a.reason;
  return (
    <div className={`action${open ? " is-open" : ""}`} data-disabled={disabled}>
      <button type="button" className="action__head" aria-expanded={open} aria-controls={`${id}-body`} onClick={() => setOpen((o) => !o)}>
        <span className={`cat-icon ${CAT[a.category]?.cls ?? ""}`} aria-hidden="true">
          <Icon name={CAT[a.category]?.icon ?? "flag"} size={16} />
        </span>
        <span className="title">{a.label}</span>
        <span className="action__costs">
          {a.energy > 0 && (
            <span className="cost-chip">
              <Icon name="bolt" size={13} /> {a.energy}
            </span>
          )}
          {!!a.cost && <span className="cost-chip">R$ {a.cost.toLocaleString("pt-BR")}</span>}
          {disabled && (
            <span className="cost-chip locked">
              <Icon name="lock" size={13} />
            </span>
          )}
        </span>
        <Icon name="chevron" size={18} className="action__chev" />
      </button>
      {open && (
        <div className="action__body" id={`${id}-body`}>
          <p className="desc">{a.description}</p>
          {disabled ? (
            <FormMessage tone="info">{a.reason}</FormMessage>
          ) : (
            <form action={action} noValidate>
              <input type="hidden" name="__year" value={year} />
              <input type="hidden" name="__action" value={a.id} />
              {a.params.map((p) =>
                p.options ? (
                  <Select key={p.name} name={p.name} label={p.label} options={p.options} optional={p.optional} />
                ) : (
                  <TextField
                    key={p.name}
                    name={p.name}
                    label={p.label}
                    optional={p.optional}
                    inputMode={p.type === "number" ? "numeric" : undefined}
                    maxLength={90}
                  />
                ),
              )}
              <SubmitButton tone="primary" icon="play" pendingLabel="Executando…">
                Executar
              </SubmitButton>
              {state.message && <FormMessage tone={state.ok ? "ok" : "err"}>{state.message}</FormMessage>}
            </form>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionPanel({ year, actions, empty }: { year: number; actions: ActionView[]; empty?: string }) {
  if (!actions.length) return <div className="empty">{empty ?? "Nenhuma ação nesta categoria."}</div>;
  const sorted = [...actions].sort((x, y) => Number(!!x.reason) - Number(!!y.reason));
  return (
    <div className="actions">
      {sorted.map((a) => (
        <ActionItem key={a.id} year={year} a={a} />
      ))}
    </div>
  );
}
