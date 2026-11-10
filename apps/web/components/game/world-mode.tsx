"use client";
import { createContext, useContext } from "react";

/**
 * Mundo compartilhado: o tempo anda sozinho em saltos fixos, então as decisões não param o
 * relógio nem vencem (esperam a resposta do jogador). Nos mundos só do jogador, o tempo para nelas.
 */
const SharedWorld = createContext(false);

export function SharedWorldProvider({ shared, children }: { shared: boolean; children: React.ReactNode }) {
  return <SharedWorld.Provider value={shared}>{children}</SharedWorld.Provider>;
}

export const useSharedWorld = (): boolean => useContext(SharedWorld);
