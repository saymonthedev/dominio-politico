"use client";
import { useEffect, useRef, useState } from "react";
import type { Release } from "@/lib/release";
import { useModal } from "./a11y";
import { Button } from "./forms";
import { Icon } from "./Icon";
import { OPEN_SUPPORT, openSupport, type PixInfo } from "./Support";
import { SupportDialog } from "./SupportDialog";

const SEEN_RELEASE = "dp:novidades";
const SUPPORT_DAY = "dp:apoio:dia";
/** espera a tela assentar antes de qualquer aviso */
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

/** Dia de hoje no horário de Brasília (o lembrete de apoio vale por dia do calendário). */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());

const busy = () => !!document.querySelector(".tm.is-live, .ev-overlay, .pr-overlay, .ui-overlay");

function ReleaseDialog({ release, onClose, donations }: { release: Release; onClose: () => void; donations: boolean }) {
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
          {release.items.filter((it) => donations || !("donation" in it)).map((it) => (
            <li key={it.text}>
              <Icon name={it.icon} size={18} />
              <span>{it.text}</span>
            </li>
          ))}
        </ul>
        <div className="ui-dialog__actions">
          {donations && (
            <Button
              type="button"
              tone="ghost"
              icon="heart"
              onClick={() => {
                onClose();
                openSupport();
              }}
            >
              Apoiar o jogo
            </Button>
          )}
          <Button type="button" tone="gold" onClick={onClose}>
            Bora jogar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Avisos de quem entra no jogo, um por vez e sem atrapalhar: primeiro as novidades da versão (uma vez
 * por versão); noutra visita, o lembrete de apoio por Pix (no máximo uma vez por dia). Os botões
 * "Apoiar" do jogo abrem a caixa de apoio por aqui (evento OPEN_SUPPORT).
 */
export function Announcements({ pix, release }: { pix: PixInfo | null; release: Release }) {
  const [open, setOpen] = useState<null | "news" | "support" | "reminder">(null);
  useEffect(() => {
    const onOpen = () => {
      write(SUPPORT_DAY, today());
      setOpen("support");
    };
    window.addEventListener(OPEN_SUPPORT, onOpen);
    let timer: ReturnType<typeof setTimeout>;
    const decide = () => {
      if (busy()) {
        timer = setTimeout(decide, RETRY_MS);
        return;
      }
      if (read(SEEN_RELEASE) !== release.id) {
        write(SEEN_RELEASE, release.id);
        setOpen("news");
      } else if (pix && read(SUPPORT_DAY) !== today()) {
        write(SUPPORT_DAY, today());
        setOpen("reminder");
      }
    };
    timer = setTimeout(decide, FIRST_DELAY_MS);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(OPEN_SUPPORT, onOpen);
    };
  }, [release.id, pix]);
  if (open === "news") return <ReleaseDialog release={release} donations={!!pix} onClose={() => setOpen(null)} />;
  if (open && pix) return <SupportDialog pix={pix} reminder={open === "reminder"} onClose={() => setOpen(null)} />;
  return null;
}
