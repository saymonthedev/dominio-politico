"use client";
import { useEffect, useRef, useState } from "react";
import type { Release } from "@/lib/release";
import { useModal } from "./a11y";
import { Button } from "./forms";
import { Icon } from "./Icon";

const SEEN_RELEASE = "dp:novidades";
/** espera a tela assentar antes do aviso */
const FIRST_DELAY_MS = 2_500;
/** algo acontecendo (relógio rodando, acontecimento, apuração, outro pop-up): tenta de novo depois */
const RETRY_MS = 15_000;

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    // modo privado ou armazenamento bloqueado: o aviso pode voltar, sem problema
  }
};

const busy = () => !!document.querySelector(".tm.is-live, .ev-overlay, .pr-overlay, .ui-overlay");

function ReleaseDialog({ release, onClose }: { release: Release; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, onClose);
  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog news" role="dialog" aria-modal="true" aria-labelledby="news-title" ref={box}>
        <span className="ui-dialog__icon news__icon">
          <Icon name="sparkle" size={24} />
        </span>
        <div className="news__kicker">Novidades · {release.date}</div>
        <h2 id="news-title">{release.title}</h2>
        <p>{release.lede}</p>
        <ul className="news__list">
          {release.items.map((it) => (
            <li key={it.text}>
              <Icon name={it.icon} size={18} />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
        <div className="ui-dialog__actions">
          <Button type="button" tone="gold" onClick={onClose}>
            Bora jogar
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Novidades da versão para quem entra no jogo: uma vez por versão, sem atrapalhar o que estiver na tela. */
export function Announcements({ release }: { release: Release }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const decide = () => {
      if (busy()) {
        timer = setTimeout(decide, RETRY_MS);
        return;
      }
      if (read(SEEN_RELEASE) !== release.id) {
        write(SEEN_RELEASE, release.id);
        setOpen(true);
      }
    };
    timer = setTimeout(decide, FIRST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [release.id]);
  return open ? <ReleaseDialog release={release} onClose={() => setOpen(false)} /> : null;
}
