"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAction } from "@/app/jogo/actions";
import { Button } from "../forms";
import { useToast } from "./Toaster";

/** Executa uma ação do jogo com um clique e mostra o resultado. */
export function QuickAction({
  year,
  action,
  params,
  label,
  tone = "primary",
  size = "sm",
  icon,
  full,
}: {
  year: number;
  action: string;
  params?: Record<string, string>;
  label: string;
  tone?: "primary" | "gold" | "ghost" | "danger" | "on-dark";
  size?: "sm" | "lg";
  icon?: string;
  full?: boolean;
}) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Button
      type="button"
      tone={tone}
      size={size}
      icon={icon}
      full={full}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await quickAction(year, action, params);
          toast({ tone: r.ok ? "ok" : "err", title: r.ok ? label : "Não deu certo", body: r.message });
          router.refresh();
        })
      }
    >
      {label}
    </Button>
  );
}
