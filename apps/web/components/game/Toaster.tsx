"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { Icon } from "../Icon";

type Tone = "ok" | "err" | "info";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  body?: string;
}

const ToastCtx = createContext<(t: Omit<Toast, "id">) => void>(() => undefined);

export const useToast = () => useContext(ToastCtx);

/** Avisos curtos no canto da tela (resultado de ações, avanço do tempo). */
export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === "err" ? 8000 : 5500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === "err" ? "alert" : "status"}>
            <span className="toast__icon">
              <Icon name={t.tone === "ok" ? "check" : t.tone === "err" ? "alert" : "info"} size={18} />
            </span>
            <div>
              <b>{t.title}</b>
              {t.body && <p>{t.body}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))} aria-label="Fechar aviso">
              <Icon name="x" size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
