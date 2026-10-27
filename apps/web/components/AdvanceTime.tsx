"use client";
import { useActionState, useState } from "react";
import { advanceTime } from "@/app/jogo/actions";
import type { FastForwardResult } from "@/lib/sim";

const fmt = (d: string) => d.split("-").reverse().join("/");

export function AdvanceTime({ year }: { year: number }) {
  const [state, action, pending] = useActionState<FastForwardResult | null, FormData>(advanceTime, null);
  const [open, setOpen] = useState(true);
  return (
    <div className="advance">
      <form action={action} className="row" style={{ gap: 6 }}>
        <input type="hidden" name="__year" value={year} />
        <span className="label" style={{ color: "#b8c4d8" }}>Avançar</span>
        {[1, 7, 15].map((d) => (
          <button key={d} name="days" value={d} className={`btn small ${d === 15 ? "gold" : "on-dark"}`} disabled={pending} onClick={() => setOpen(true)}>
            {pending ? "…" : `${d} dia${d > 1 ? "s" : ""}`}
          </button>
        ))}
      </form>
      {state && open && (
        <div className="advance-panel" role="status">
          <div className="row between">
            <b>{state.ok ? `De ${fmt(state.from!)} a ${fmt(state.to!)}` : "Não foi possível avançar"}</b>
            <button className="btn ghost small" onClick={() => setOpen(false)} aria-label="Fechar">✕</button>
          </div>
          {!state.ok && <p className="form-msg err">{state.message}</p>}
          {state.ok && (
            <>
              {state.notifications && state.notifications.length > 0 && (
                <div className="mt">
                  <div className="label">Para você</div>
                  {state.notifications.map((n, i) => (
                    <div key={i} style={{ fontSize: ".86rem", marginTop: 6 }}>
                      <b>{n.title}</b> — <span className="muted">{n.body}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt">
                <div className="label">O que aconteceu no país</div>
                {state.headlines && state.headlines.length ? (
                  state.headlines.map((h, i) => (
                    <div key={i} style={{ fontSize: ".86rem", marginTop: 6 }}>
                      <span className="mono muted">{fmt(h.date)}</span> · {h.headline}
                    </div>
                  ))
                ) : (
                  <p className="muted">Dias tranquilos: nenhuma manchete relevante.</p>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
