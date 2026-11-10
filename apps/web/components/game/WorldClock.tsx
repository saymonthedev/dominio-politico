"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryEvent } from "@dp/engine";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { Term } from "../Term";
import { EventModal } from "./EventModal";

/** Relógio de um mundo compartilhado: o tempo anda sozinho, igual para todos. */
export interface SharedClock {
  /** outros jogadores que jogaram nas últimas 72 h */
  others: number;
  /** madrugada (0h às 7h de Brasília): ritmo lento */
  night: boolean;
  /** dias de jogo por hora real agora */
  perHour: number;
  /** quando o ritmo muda (hora real, ISO) e a hora de Brasília da mudança ("7h", "0h") */
  changesAt: string;
  changesLabel: string;
  /** o mundo ficou bem atrás do relógio e está alcançando */
  catchingUp: boolean;
}

interface Props {
  year: number;
  date: string;
  energy: number;
  clock: SharedClock;
  /** próximo compromisso da agenda */
  next?: { label: string; date: string } | null;
  /** marcos que caem hoje (já começaram) */
  today?: string[];
  /** acontecimentos esperando resposta */
  pending?: StoryEvent[];
}

const DAY = 86_400_000;
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** alcançando: a tela tenta buscar o mundo novo algumas vezes; depois disso, espera o jogador */
const MAX_TRIES = 8;

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

/**
 * O tempo do mundo compartilhado: ninguém avança na mão. A tela mostra o ritmo de agora e
 * se atualiza sozinha (com a aba à vista) para acompanhar o calendário andando.
 */
export function WorldClock({ year, date, energy, clock, next, today = [], pending = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<StoryEvent | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tries = useRef(0);
  const waiting = useRef(false);
  const cur = at(date);
  const toNext = next ? Math.round((at(next.date).getTime() - cur.getTime()) / DAY) : null;
  const minutesPerDay = Math.round(60 / clock.perHour);

  // o mundo andou: recomeça a contagem de tentativas
  useEffect(() => {
    tries.current = 0;
  }, [date]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") {
        waiting.current = true;
        return;
      }
      if (clock.catchingUp) {
        if (tries.current >= MAX_TRIES) return;
        tries.current += 1;
      }
      setAttempt((a) => a + 1);
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && waiting.current) {
        waiting.current = false;
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    // alcançando: confere de novo em 15 s; senão, de tempos em tempos e logo depois da troca de ritmo
    const every = clock.night ? 20 * 60_000 : 4 * 60_000;
    const toChange = Date.parse(clock.changesAt) - Date.now() + 5_000;
    const wait = clock.catchingUp ? 15_000 : Math.max(5_000, toChange > 0 ? Math.min(every, toChange) : every);
    const t = setTimeout(refresh, wait);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clock.catchingUp, clock.night, clock.changesAt, date, attempt, router]);

  const stuck = clock.catchingUp && tries.current >= MAX_TRIES;

  return (
    <section className="tm tm--shared" aria-labelledby="tm-title">
      <div className="tm__now">
        <span className="tm__kicker">
          <Icon name="clock" size={14} /> O tempo do mundo
        </span>
        <h2 id="tm-title">
          <small>{WEEKDAY[cur.getUTCDay()].replace(/^./, (c) => c.toUpperCase())}</small>
          <span>
            {cur.getUTCDate()} de {MONTHS_LONG[cur.getUTCMonth()]} de {cur.getUTCFullYear()}
          </span>
        </h2>
        <p>
          {today.length > 0 && (
            <>
              Hoje: <b>{today.join("; ")}</b> (começou).{" "}
            </>
          )}
          {next && toNext !== null && toNext >= 1 ? (
            <>
              Próximo marco: <b>{next.label}</b>, {toNext === 1 ? "amanhã" : `daqui a ${toNext} dias`}.{" "}
            </>
          ) : null}
          Energia: {Math.round(energy)}/100 (recupera 25 por dia de jogo).
        </p>
      </div>

      <div className={`tm__next${clock.catchingUp ? " is-busy" : ""}`} role="status" aria-live="polite">
        <span className="tm__next-label">
          <Icon name={clock.catchingUp ? "zap" : clock.night ? "clock" : "play"} size={14} /> {clock.catchingUp ? "Alcançando o relógio" : clock.night ? "Ritmo da madrugada" : "Ritmo agora"}
        </span>
        {clock.catchingUp ? (
          <>
            <b className="tm__next-time">{stuck ? "O mundo está demorando para andar" : "O mundo está andando os dias que faltam"}</b>
            <p>{stuck ? "Atualize a página daqui a pouco para ver o mundo novo." : "A tela atualiza sozinha em instantes."}</p>
          </>
        ) : (
          <>
            <b className="tm__next-time">
              1 dia a cada {minutesPerDay} min
              <small>{clock.night ? "1 semana a cada 2 horas" : "2 meses a cada 2 horas"}</small>
            </b>
            <p>
              {clock.night ? (
                <>
                  Da 0h às 7h de Brasília o tempo anda devagar. Às <b>{clock.changesLabel}</b> volta ao ritmo do dia: 2 meses a cada 2 horas.
                </>
              ) : (
                <>
                  À <b>{clock.changesLabel === "0h" ? "meia-noite" : clock.changesLabel}</b> desacelera para a madrugada: 1 semana a cada 2 horas, até as 7h.
                </>
              )}
            </p>
          </>
        )}
      </div>

      {pending.length > 0 && (
        <div className="tm__wait is-wide" role="note">
          <Icon name="alert" size={18} />
          <span>
            <b>{pending.length === 1 ? "Uma decisão espera você" : `${pending.length} decisões esperam você`}:</b> {pending[0].title}. Ela fica aqui até você responder.
          </span>
          <Button tone="gold" size="sm" onClick={() => setOpen(pending[0])}>
            Decidir agora
          </Button>
        </div>
      )}

      <div className="tm__shared">
        <p>
          <Icon name="users" size={15} />
          <span>
            <b>
              <Term k="Relógio compartilhado" />
            </b>
            : o tempo anda sozinho, igual para todos. De dia, 2 meses de jogo a cada 2 horas; da 0h às 7h de Brasília, 1 semana a cada 2 horas. Ninguém avança na mão.{" "}
            {clock.others > 0 ? `${clock.others === 1 ? "Outro jogador jogou" : `${clock.others} outros jogadores jogaram`} neste mundo nos últimos 3 dias.` : "Você é o único jogador ativo neste mundo nos últimos 3 dias."}
          </span>
        </p>
      </div>

      {open && (
        <EventModal
          key={open.id}
          year={year}
          event={open}
          today={date}
          onLater={() => setOpen(null)}
          onResolved={() => {
            setOpen(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
