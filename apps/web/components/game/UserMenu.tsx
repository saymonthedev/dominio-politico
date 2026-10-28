"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

export function UserMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="umenu" ref={box}>
      <button type="button" className="topbtn topbtn--avatar" aria-expanded={open} aria-label="Menu da conta" onClick={() => setOpen((o) => !o)}>
        {initials}
      </button>
      {open && (
        <div className="umenu__pop">
          <a href="/jogo">
            <Icon name="flag" size={16} /> Meus mundos
          </a>
          <a href="/conta">
            <Icon name="user" size={16} /> Minha conta
          </a>
          <a href="/manual">
            <Icon name="book" size={16} /> Manual
          </a>
          <form action="/sair" method="post">
            <button type="submit">
              <Icon name="logout" size={16} /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
