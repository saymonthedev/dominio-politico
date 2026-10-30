"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryEvent } from "@dp/engine";
import { usePopover } from "../a11y";
import { Icon } from "../Icon";
import { EventModal } from "./EventModal";
import { deadline, KIND, STORY_INTRO, TAG } from "./story-ui";

const SEEN_KEY = "dp:eventos-vistos";

function seenSet(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function markSeen(id: string) {
  try {
    const s = seenSet();
    s.add(id);
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-60)));
  } catch {
    /* sessão sem armazenamento: só não lembra */
  }
}

/** Um pop-up por vez em toda a tela (o relógio também abre os seus). */
export function storyModalOpen(): boolean {
  return typeof document !== "undefined" && !!document.querySelector(".ev-overlay");
}

/** O relógio está rodando (ou parado numa decisão): ele mesmo mostra as decisões. */
function clockBusy(): boolean {
  return typeof document !== "undefined" && !!document.querySelector(".tm.is-live");
}

function EventRow({ ev, today, onOpen }: { ev: StoryEvent; today: string; onOpen: () => void }) {
  const kind = KIND[ev.kind];
  const due = deadline(today, ev.expires);
  return (
    <li className={`sc__item sc__item--${kind.tone}`}>
      <button type="button" onClick={onOpen}>
        <span className="sc__icon" aria-hidden="true">
          <Icon name={ev.blocking ? "alert" : TAG[ev.tags[0]]?.icon ?? kind.icon} size={16} />
        </span>
        <span className="sc__txt">
          <b>{ev.title}</b>
          <small>
            {kind.label}
            {ev.blocking ? " · segura o tempo" : ""}
            {due ? ` · ${due}` : ""}
          </small>
        </span>
        <Icon name="chevron" size={16} />
      </button>
    </li>
  );
}

/** Painel de acontecimentos esperando resposta (Painel). */
export function StoryInbox({ year, events, today }: { year: number; events: StoryEvent[]; today: string }) {
  const [open, setOpen] = useState<StoryEvent | null>(null);
  const router = useRouter();
  if (!events.length) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        {STORY_INTRO} Agora não há nada esperando você: passe o tempo e eles aparecem aqui.
      </p>
    );
  }
  return (
    <>
      <p className="muted small sc__lede">Responda clicando em cada um. Decisões param o tempo; oportunidades podem esperar até o prazo.</p>
      <ul className="sc__list">
        {events.map((ev) => (
          <EventRow key={ev.id} ev={ev} today={today} onOpen={() => setOpen(ev)} />
        ))}
      </ul>
      {open && (
        <EventModal
          year={year}
          event={open}
          today={today}
          onLater={() => setOpen(null)}
          onResolved={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

/** Botão do topo com os acontecimentos pendentes; abre sozinho as escolhas que chegaram. */
export function StoryBell({ year, events, today }: { year: number; events: StoryEvent[]; today: string }) {
  const [list, setList] = useState(events);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState<StoryEvent | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  usePopover(box, menu, () => setMenu(false), { trigger, focusFirst: true });

  useEffect(() => setList(events), [events]);

  // escolha que chegou enquanto você estava fora: aparece sozinha, uma vez por sessão
  useEffect(() => {
    const seen = seenSet();
    const urgent = events.find((e) => e.blocking && !seen.has(e.id)) ?? events.find((e) => e.kind !== "INFO" && e.choices.length > 0 && !seen.has(e.id));
    if (!urgent || clockBusy()) return;
    const t = setTimeout(() => {
      if (storyModalOpen() || clockBusy()) return;
      markSeen(urgent.id);
      setOpen(urgent);
    }, 900);
    return () => clearTimeout(t);
  }, [events]);

  const blocking = list.filter((e) => e.blocking).length;
  return (
    <div className="sc" ref={box}>
      <button
        ref={trigger}
        type="button"
        className={`sc__btn${blocking ? " is-urgent" : list.length ? " has-items" : ""}`}
        onClick={() => setMenu((v) => !v)}
        aria-expanded={menu}
        aria-haspopup="true"
        aria-label={list.length ? `Acontecimentos: ${list.length} esperando resposta` : "Acontecimentos"}
        title="Acontecimentos da carreira"
      >
        <Icon name="zap" size={18} />
        <span className="sc__label">Acontecimentos</span>
        {list.length > 0 && <span className="sc__badge">{list.length}</span>}
      </button>
      {menu && (
        <div className="sc__pop" role="dialog" aria-label="Acontecimentos esperando resposta">
          <div className="sc__pophead">
            <b>Acontecimentos</b>
            <a href={`/jogo/${year}/carreira#historia`}>Histórico</a>
          </div>
          <p className="sc__explain">{STORY_INTRO}</p>
          {list.length ? (
            <ul className="sc__list">
              {list.map((ev) => (
                <EventRow
                  key={ev.id}
                  ev={ev}
                  today={today}
                  onOpen={() => {
                    setMenu(false);
                    setOpen(ev);
                  }}
                />
              ))}
            </ul>
          ) : (
            <p className="muted small sc__empty">Nada esperando você agora.</p>
          )}
        </div>
      )}
      {open && (
        <EventModal
          year={year}
          event={open}
          today={today}
          onLater={() => {
            markSeen(open.id);
            setOpen(null);
          }}
          onResolved={(r) => {
            markSeen(open.id);
            setOpen(null);
            if (r.pending) setList(r.pending);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
