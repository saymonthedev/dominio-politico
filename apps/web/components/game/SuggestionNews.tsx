"use client";
import { useEffect, useRef, useState } from "react";
import type { PopupItem } from "@/lib/suggestions";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";

const SEEN = "dp:sugestoes:vistas";
/** depois do aviso de novidades da versão (que espera 2,5 s) */
const FIRST_DELAY_MS = 4_000;
/** algo acontecendo na tela (relógio, acontecimento, outro pop-up): tenta de novo depois */
const RETRY_MS = 12_000;
/** no aviso, só as atualizações das últimas 2 semanas (a aba Sugestões mostra 30 dias) */
const RECENT_MS = 14 * 86_400_000;

const readSeen = (): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
};
const writeSeen = (ids: Set<string>) => {
  try {
    localStorage.setItem(SEEN, JSON.stringify([...ids].slice(-300)));
  } catch {
    // armazenamento bloqueado: o aviso pode voltar, sem problema
  }
};
const busy = () => !!document.querySelector(".tm.is-live, .ev-overlay, .pr-overlay, .ui-overlay");

type Open = { kind: "news" | "mine"; items: PopupItem[] };

function Dialog({ kind, items, onClose }: Open & { onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, onClose);
  const news = kind === "news";
  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog news" role="dialog" aria-modal="true" aria-labelledby="sugn-title" ref={box}>
        <span className="ui-dialog__icon news__icon">
          <Icon name={news ? "sparkle" : "chat"} size={24} />
        </span>
        <div className="news__kicker">{news ? "Atualização do jogo" : "Resposta à sua sugestão"}</div>
        <h2 id="sugn-title">
          {news ? (items.length === 1 ? "Uma sugestão de jogador entrou no jogo!" : `${items.length} sugestões de jogadores entraram no jogo!`) : items.length === 1 ? "Sua sugestão não vai entrar agora" : "Suas sugestões não vão entrar agora"}
        </h2>
        <ul className="news__list">
          {items.map((it) => (
            <li key={it.id}>
              <Icon name={news ? "star" : "info"} size={18} />
              <span>
                <b>{it.title}</b>
                {news && it.author ? (
                  <>
                    {" "}
                    · sugestão de <b>{it.author}</b>
                  </>
                ) : null}
                {it.note ? (
                  <>
                    <br />
                    {it.note}
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
        {!news && <p className="muted small">Obrigado por sugerir! Pode mandar outras ideias quando quiser, em Bastidores, Sugestões.</p>}
        {news && <p className="muted small">Obrigado a quem sugeriu! Tem uma ideia? Mande em Bastidores, Sugestões.</p>}
        <div className="ui-dialog__actions">
          <Button type="button" tone="gold" onClick={onClose}>
            {news ? "Bora jogar" : "Entendi"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Avisos das sugestões, um de cada vez e uma vez só: primeiro as que viraram atualização (para
 * todos, com o nome de quem sugeriu); depois as reprovadas da própria conta (só para ela).
 */
export function SuggestionNews({ news, mine }: { news: PopupItem[]; mine: PopupItem[] }) {
  const [open, setOpen] = useState<Open | null>(null);
  const [round, setRound] = useState(0);
  useEffect(() => {
    if (open) return;
    let timer: ReturnType<typeof setTimeout>;
    const decide = () => {
      if (busy()) {
        timer = setTimeout(decide, RETRY_MS);
        return;
      }
      const seen = readSeen();
      const fresh = news.filter((x) => !seen.has(x.id) && Date.now() - Date.parse(x.at) < RECENT_MS);
      const mineFresh = mine.filter((x) => !seen.has(x.id));
      const next: Open | null = fresh.length ? { kind: "news", items: fresh } : mineFresh.length ? { kind: "mine", items: mineFresh } : null;
      if (!next) return;
      next.items.forEach((x) => seen.add(x.id));
      writeSeen(seen);
      setOpen(next);
    };
    timer = setTimeout(decide, round ? 1_500 : FIRST_DELAY_MS);
    return () => clearTimeout(timer);
  }, [news, mine, open, round]);
  if (!open) return null;
  return (
    <Dialog
      {...open}
      onClose={() => {
        setOpen(null);
        setRound((r) => r + 1);
      }}
    />
  );
}
