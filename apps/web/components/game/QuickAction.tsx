"use client";
import { Button } from "../forms";
import { useGameAction } from "./ActionFx";

/** Executa uma ação do jogo com um clique: mostra o andamento no botão e o resultado (com o que mudou) num aviso. */
export function QuickAction({
  year,
  action,
  params,
  label,
  tone = "primary",
  size = "sm",
  icon,
  full,
  onDone,
}: {
  year: number;
  action: string;
  params?: Record<string, string>;
  label: string;
  tone?: "primary" | "gold" | "ghost" | "danger" | "on-dark";
  size?: "sm" | "lg";
  icon?: string;
  full?: boolean;
  /** chamado depois da resposta do servidor (ex.: esconder os botões de um convite já respondido) */
  onDone?: (ok: boolean) => void;
}) {
  const { run, pending, locked, phrase } = useGameAction(year);
  return (
    <Button
      type="button"
      tone={tone}
      size={size}
      icon={icon}
      full={full}
      loading={pending}
      disabled={locked}
      onClick={() => run(action, params ?? {}, label, (r) => onDone?.(r.ok))}
    >
      {pending ? phrase : label}
    </Button>
  );
}
