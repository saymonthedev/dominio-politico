"use client";
import { useId, useRef, useState } from "react";
import { usePopover } from "../a11y";
import { Icon } from "../Icon";

export function UserMenu({ initials }: { initials: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  usePopover(box, open, () => setOpen(false), { trigger, menu: true, focusFirst: true });
  return (
    <div className="umenu" ref={box}>
      <button
        type="button"
        ref={trigger}
        className="topbtn topbtn--avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Menu da conta"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {initials}
      </button>
      {open && (
        <div className="umenu__pop" id={id} role="menu" aria-label="Conta">
          <a href="/jogo" role="menuitem">
            <Icon name="flag" size={16} /> Meus mundos
          </a>
          <a href="/conta" role="menuitem">
            <Icon name="user" size={16} /> Minha conta
          </a>
          <a href="/manual" role="menuitem">
            <Icon name="book" size={16} /> Manual
          </a>
          <a href="/glossario" role="menuitem">
            <Icon name="info" size={16} /> Glossário
          </a>
          <form action="/sair" method="post" role="none">
            <button type="submit" role="menuitem">
              <Icon name="logout" size={16} /> Sair
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
