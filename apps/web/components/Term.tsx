"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { glossaryEntry } from "@/lib/glossary";

/**
 * Termo do glossário com explicação ao passar o mouse, focar com o teclado ou
 * tocar. Esc fecha. Sem verbete, mostra só o texto.
 */
export function Term({ k, children }: { k: string; children?: React.ReactNode }) {
  const entry = glossaryEntry(k);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();
  const tip = useRef<HTMLSpanElement>(null);
  const box = useRef<HTMLSpanElement>(null);

  // mantém a dica dentro da tela
  useLayoutEffect(() => {
    if (!open || !tip.current) return;
    const r = tip.current.getBoundingClientRect();
    const pad = 12;
    if (r.left < pad) setShift(pad - r.left);
    else if (r.right > window.innerWidth - pad) setShift(window.innerWidth - pad - r.right);
  }, [open]);
  useEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  if (!entry) return <>{children ?? k}</>;
  return (
    <span className="term" ref={box} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        className="term__word"
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span role="tooltip" id={id} ref={tip} className="term__tip" style={shift ? { transform: `translateX(calc(-50% + ${shift}px))` } : undefined}>
          <b>{entry.term}</b>
          {entry.text}
        </span>
      )}
    </span>
  );
}
