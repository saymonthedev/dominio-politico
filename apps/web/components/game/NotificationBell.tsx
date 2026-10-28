"use client";
import { useEffect, useRef, useState } from "react";
import { markNotificationsRead } from "@/app/jogo/actions";
import { inviteIdOf, resolveLink } from "@/lib/links";
import { Icon } from "../Icon";
import { QuickAction } from "./QuickAction";

export interface BellItem {
  id: string;
  title: string;
  body: string;
  date: string;
  link: string | null;
  unread: boolean;
}

const fmt = (d: string) => d.split("-").reverse().join("/");

/** Sino com as últimas notificações; ao abrir, tudo fica lido. Convites têm resposta ali mesmo. */
export function NotificationBell({ year, unread, items, openInvites }: { year: number; unread: number; items: BellItem[]; openInvites: string[] }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(unread);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => setCount(unread), [unread]);
  useEffect(() => {
    if (!open) return;
    if (count > 0) {
      setCount(0);
      void markNotificationsRead(year);
    }
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pendingInvites = new Set(openInvites);
  return (
    <div className="bellbox" ref={box}>
      <button type="button" className="topbtn" aria-expanded={open} aria-label={count ? `${count} notificações novas` : "Notificações"} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" size={20} />
        {count > 0 && <span className="topbtn__count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="bellpop" role="dialog" aria-label="Notificações">
          <div className="bellpop__head">
            <b>Notificações</b>
            <a href={`/jogo/${year}/notificacoes`}>Ver todas</a>
          </div>
          <div className="bellpop__list">
            {items.length ? (
              items.map((n) => {
                const href = resolveLink(n.link, year);
                const invite = inviteIdOf(n.link);
                return (
                  <div key={n.id} className={`bellitem${n.unread ? " is-new" : ""}`}>
                    <div className="bellitem__top">
                      <b>{href && !invite ? <a href={href}>{n.title}</a> : n.title}</b>
                      <small className="mono">{fmt(n.date)}</small>
                    </div>
                    <p>{n.body}</p>
                    {invite && pendingInvites.has(invite) && (
                      <div className="bellitem__actions">
                        <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "ACEITAR" }} label="Aceitar filiação" tone="gold" icon="check" />
                        <QuickAction year={year} action="responder_convite" params={{ request: invite, decision: "RECUSAR" }} label="Recusar" tone="ghost" />
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="bellpop__empty">Nada por aqui ainda.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
