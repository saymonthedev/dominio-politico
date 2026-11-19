"use client";
import { useEffect } from "react";

/** Guarda o convite no navegador por 30 dias: se a pessoa criar a conta depois, o convite vai junto. */
export function InviteCookie({ code }: { code: string }) {
  useEffect(() => {
    document.cookie = `dp_convite=${code}; max-age=${30 * 86_400}; path=/; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
  }, [code]);
  return null;
}
