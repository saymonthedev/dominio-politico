"use client";
import { useEffect } from "react";
import { AUTHOR } from "@/lib/author";

/** Assinatura no console do navegador, para quem abre as ferramentas de desenvolvedor (não aparece para mais ninguém). */
export function Signature() {
  useEffect(() => {
    const w = window as unknown as { __dpSigned?: boolean };
    if (w.__dpSigned) return;
    w.__dpSigned = true;
    console.log(
      `%cDomínio Político%c\ncriado por ${AUTHOR.name} · ${AUTHOR.siteLabel} · ${AUTHOR.handle}`,
      "font: 800 16px Poppins, system-ui, sans-serif; color: #d4a53c",
      "font: 12px ui-monospace, monospace; color: #8193ad",
    );
  }, []);
  return null;
}
