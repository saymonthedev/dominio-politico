"use client";
import { useEffect } from "react";

/**
 * Marca no <html> quando a pessoa está navegando pelo teclado (apertou Tab) e
 * desmarca ao tocar ou clicar. O atalho "Pular para o conteúdo" só aparece nesse
 * modo: fechar o DevTools ou outra janela devolve o foco à página e, sem isso,
 * o atalho surgia sozinho no canto da tela.
 */
export function KeyboardMode() {
  useEffect(() => {
    const root = document.documentElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Tab") root.dataset.kbd = "1";
    };
    const onPointer = () => {
      delete root.dataset.kbd;
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  return null;
}
