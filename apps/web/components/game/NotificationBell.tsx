"use client";
import { InviteActions } from "./InviteActions";
import { useEffect, useId, useRef, useState } from "react";
import { markNotificationsRead } from "@/app/jogo/actions";
import { inviteIdOf, resolveLink } from "@/lib/links";
import { usePopover } from "../a11y";
import { Icon } from "../Icon";

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
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => setCount(unread), [unread]);
  usePopover(box, open, () => setOpen(false), { trigger, focusFirst: true });
  useEffect(() => {
    if (!open || count === 0) return;
    setCount(0);
    void markNotificationsRead(year);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const pendingInvites = new Set(openInvites);
  return (
    <div className="bellbox" ref={box}>
      <button
        type="button"
        ref={trigger}
        className="topbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={count ? `${count} notificações novas` : "Notificações"}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" size={20} />
        {count > 0 && <span className="topbtn__count">{count > 99 ? "99+" : count}</span>}
      </button>
      {open && (
        <div className="bellpop" id={id} role="dialog" aria-label="Notificações">
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
                      <InviteActions year={year} invite={invite} className="bellitem__actions" />
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
