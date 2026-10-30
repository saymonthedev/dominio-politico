"use client";
import { useEffect, useRef, useState } from "react";
import type { StoryEvent } from "@dp/engine";
import { answerEvent } from "@/app/jogo/actions";
import type { DecideResult } from "@/lib/sim";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { DeltaChips } from "./ActionFx";
import { deadline, dayShort, initialsOf, KIND, markSeen, STORY_INTRO, TAG, TONE_LABEL } from "./story-ui";

const INTRO_KEY = "dp:intro-acontecimentos";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

export interface EventModalProps {
  year: number;
  event: StoryEvent;
  /** data do jogo, para o prazo */
  today?: string;
  /** depois da escolha e do resultado visto ("Continuar") */
  onResolved: (r: DecideResult) => void;
  /** fechar sem decidir (fica na central de acontecimentos) */
  onLater?: () => void;
  /** posição numa fila de decisões, se houver */
  queue?: { index: number; total: number };
  /** comemorar subida de etapa ao continuar (o relógio comemora no fim do período) */
  celebrate?: boolean;
}

/**
 * Pop-up de um acontecimento da carreira: quem, o quê, o prazo e as escolhas.
 * Depois da escolha, mostra o que aconteceu e o que mudou no personagem.
 */
export function EventModal({ year, event, today, onResolved: resolved, onLater, queue, celebrate = true }: EventModalProps) {
  const onResolved = (r: DecideResult) => {
    if (celebrate && r.stage) window.dispatchEvent(new CustomEvent("dp:milestone", { detail: { stage: r.stage } }));
    resolved(r);
  };
  const box = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DecideResult | null>(null);
  const kind = KIND[event.kind];
  const info = event.kind === "INFO";
  // primeira vez: uma apresentação curta do que é isto
  const [intro, setIntro] = useState(false);
  // visto em qualquer tela (relógio, sino, painel): não volta a abrir sozinho
  useEffect(() => markSeen(event.id), [event.id]);
  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_KEY)) setIntro(true);
    } catch {
      /* sem armazenamento: não mostra */
    }
  }, []);
  const closeIntro = () => {
    setIntro(false);
    try {
      localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* ok */
    }
  };
  useModal(box, true, () => (result ? onResolved(result) : onLater?.()), { lockScroll: true, initial: result ? ".ev__continue" : ".ev__choice:not(:disabled)" });

  const choose = async (choiceId: string) => {
    setBusy(choiceId);
    setError(null);
    const t0 = Date.now();
    const r = await answerEvent(year, event.id, choiceId);
    // um instante de suspense: a decisão "acontece"
    const wait = 650 - (Date.now() - t0);
    if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
    setBusy(null);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setResult(r);
  };

  const due = deadline(today, event.expires);
  const choices = event.choices.length ? event.choices : [{ id: "ok", label: "Continuar" }];

  return (
    <div className="ui-overlay ev-overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && (result ? onResolved(result) : onLater?.())}>
      <div className={`ev ev--${kind.tone}${result ? " is-done" : ""}`} role="dialog" aria-modal="true" aria-labelledby="ev-title" aria-describedby="ev-text" ref={box}>
        <header className="ev__head">
          <span className="ev__kind">
            <Icon name={kind.icon} size={14} /> {kind.label}
            {event.blocking && !result && <em>o tempo espera sua resposta</em>}
          </span>
          <span className="ev__meta mono">
            {dayShort(event.on)}
            {due && !result ? ` · ${due}` : ""}
            {queue && queue.total > 1 ? ` · ${queue.index + 1} de ${queue.total}` : ""}
          </span>
          {onLater && !result && !busy && (
            <button type="button" className="ev__close" onClick={onLater} aria-label="Decidir depois">
              <Icon name="x" size={18} />
            </button>
          )}
        </header>

        <div className="ev__body">
          {intro && !result && (
            <div className="ev__intro" role="note">
              <Icon name="zap" size={16} />
              <div>
                <b>Seu primeiro acontecimento</b>
                <p>{STORY_INTRO} Leia a situação, escolha uma opção e veja o que muda. Não existe resposta sempre certa.</p>
                <ul>
                  <li><b>Decisão:</b> o tempo para até você escolher.</li>
                  <li><b>Oportunidade:</b> pode esperar, até o prazo.</li>
                  <li>Sem resposta no prazo, vale a opção mais passiva.</li>
                </ul>
                <button type="button" className="ev__introok" onClick={closeIntro}>
                  Entendi
                </button>
              </div>
            </div>
          )}
          {!result && <p className="ev__means">{kind.label}: {kind.means}.</p>}
          <div className="ev__tags">
            {event.tags.map((t) => (
              <span key={t} className="ev__tag">
                <Icon name={TAG[t]?.icon ?? "info"} size={12} /> {TAG[t]?.label ?? t}
              </span>
            ))}
          </div>
          <h2 id="ev-title">{event.title}</h2>
          {event.who && (
            <div className="ev__who">
              <span className="ev__avatar" aria-hidden="true">
                {initialsOf(event.who.name)}
              </span>
              <span>
                <b>{event.who.name}</b>
                {event.who.role && <small>{event.who.role}</small>}
              </span>
            </div>
          )}
          <p id="ev-text" className="ev__text">
            {event.text}
          </p>

          {result ? (
            <div className="ev__result" role="status">
              {result.choiceLabel && (
                <span className="ev__picked">
                  <Icon name="check" size={14} /> {result.choiceLabel}
                </span>
              )}
              <p>{result.outcome ?? result.message}</p>
              {result.deltas && result.deltas.length > 0 && <DeltaChips deltas={result.deltas} />}
              {result.ended && <p className="ev__end">Sua carreira chegou ao fim. Veja o balanço da trajetória.</p>}
            </div>
          ) : (
            <div className="ev__choices" role="group" aria-label="Suas opções">
              {choices.map((ch, i) => {
                const locked = "locked" in ch ? ch.locked : null;
                const tone = ("tone" in ch && ch.tone) || "neutral";
                const cost = "cost" in ch ? ch.cost : undefined;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    className={`ev__choice ev__choice--${tone}${busy === ch.id ? " is-busy" : ""}`}
                    style={{ ["--i" as string]: i }}
                    disabled={!!busy || !!locked}
                    onClick={() => choose(ch.id)}
                    aria-describedby={locked ? `ev-lock-${ch.id}` : undefined}
                  >
                    <span className="ev__label">
                      {busy === ch.id ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="arrow" size={15} />}
                      <b>{busy === ch.id ? "Decidindo…" : ch.label}</b>
                    </span>
                    {"hint" in ch && ch.hint && <small className="ev__hint">{ch.hint}</small>}
                    <span className="ev__costs">
                      {TONE_LABEL[tone] && <i className={`ev__tone ev__tone--${tone}`}>{TONE_LABEL[tone]}</i>}
                      {cost?.energy ? <i>−{cost.energy} energia</i> : null}
                      {cost?.money ? <i>−{brl(cost.money)}</i> : null}
                    </span>
                    {locked && (
                      <small className="ev__lock" id={`ev-lock-${ch.id}`}>
                        <Icon name="lock" size={12} /> {locked}
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {error && (
            <p className="ev__error" role="alert">
              <Icon name="alert" size={14} /> {error}
            </p>
          )}
        </div>

        {result && (
          <footer className="ev__foot">
            {result.ended ? (
              <a className="ui-btn ui-btn--gold ev__continue" href={`/jogo/fim/${year}`}>
                <span>Ver o balanço da carreira</span>
              </a>
            ) : (
              <Button tone="gold" icon="check" className="ev__continue" onClick={() => onResolved(result)}>
                {info ? "Entendi" : "Continuar"}
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
}
