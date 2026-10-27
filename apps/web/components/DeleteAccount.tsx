"use client";
import { useEffect, useRef, useState } from "react";
import { deleteMyData } from "@/app/jogo/actions";
import { Button, SubmitButton, TextField } from "./forms";
import { Icon } from "./Icon";

const WORD = "EXCLUIR";

/** Exclusão de conta com confirmação digitada, em diálogo próprio. */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    box.current?.querySelector("input")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <Button tone="danger" icon="trash" onClick={() => setOpen(true)}>
        Excluir meus dados
      </Button>
      {open && (
        <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="del-title" ref={box}>
            <span className="ui-dialog__icon">
              <Icon name="alert" size={24} />
            </span>
            <h2 id="del-title">Excluir conta e dados?</h2>
            <p>Seus personagens saem da política de forma neutra, os dados privados são apagados e sua conta de acesso deixa de existir. Não dá para desfazer.</p>
            <form action={deleteMyData}>
              <TextField label={`Digite ${WORD} para confirmar`} name="confirm" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} />
              <div className="ui-dialog__actions">
                <Button type="button" tone="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <SubmitButton tone="danger" icon="trash" disabled={typed !== WORD} pendingLabel="Excluindo…">
                  Excluir definitivamente
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
