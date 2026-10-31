"use client";
import { useState } from "react";

/**
 * Lista longa no celular: mostra os 12 primeiros itens (os mais relevantes na ordem
 * escolhida) e um botão para ver o resto. Na tela larga tudo aparece de uma vez.
 */
export function MoreList({ count, label, children }: { count: number; label: string; children: React.ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <div className={`morelist${all ? " is-all" : ""}`}>
      {children}
      {count > 12 && !all && (
        <button type="button" className="ui-btn ui-btn--ghost morelist__btn" onClick={() => setAll(true)}>
          <span>
            Ver todos os {count} {label}
          </span>
        </button>
      )}
    </div>
  );
}
