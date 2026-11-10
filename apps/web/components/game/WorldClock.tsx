"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryEvent } from "@dp/engine";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { Term } from "../Term";
import { EventModal } from "./EventModal";

/** Relógio de um mundo compartilhado (o tempo anda sozinho, em saltos fixos). */
export interface SharedClock {
  /** outros jogadores que jogaram nas últimas 72 h */
  others: number;
  /** próximo salto (hora real, ISO) e a hora de Brasília dele ("18h") */
  nextAt: string;
  nextLabel: string;
  /** a hora do salto já passou e o mundo está alcançando */
  catchingUp: boolean;
  stepDays: number;
  stepHours: number;
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
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_LONG = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const WEEKDAY = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
/** a tela tenta buscar o mundo novo algumas vezes depois da hora do salto; depois disso, espera o jogador */
const MAX_TRIES = 8;

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const short = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

function until(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 1) return "em instantes";
  if (m < 60) return `em ${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `em ${h} h ${r} min` : `em ${h} h`;
}

/**
 * O tempo do mundo compartilhado: ninguém avança na mão. A tela mostra a hora do
 * próximo salto e, passada a hora, busca o mundo atualizado sozinha (só com a aba à vista).
 */
export function WorldClock({ year, date, energy, clock, next, today = [], pending = [] }: Props) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState<StoryEvent | null>(null);
  const [attempt, setAttempt] = useState(0);
  const tries = useRef(0);
  const waiting = useRef(false);
  const nextMs = Date.parse(clock.nextAt);
  const cur = at(date);
  const toNext = next ? Math.round((at(next.date).getTime() - cur.getTime()) / DAY) : null;

  // o mundo andou: recomeça a contagem de tentativas
  useEffect(() => {
    tries.current = 0;
  }, [date]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (tries.current >= MAX_TRIES) return;
      if (document.visibilityState !== "visible") {
        waiting.current = true;
        return;
      }
      tries.current += 1;
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
    // alcançando: confere de novo em 15 s; senão, logo depois da hora do próximo salto (se o relógio
    // do aparelho estiver adiantado e o servidor ainda não virou a hora, tenta de novo em 30 s)
    const due = nextMs - Date.now();
    const wait = clock.catchingUp ? 15_000 : due > 0 ? due + 8_000 : 30_000;
    const t = setTimeout(refresh, wait);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [clock.catchingUp, nextMs, date, attempt, router]);

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
          <Icon name={clock.catchingUp ? "zap" : "calendar"} size={14} /> {clock.catchingUp ? "Avançando" : "Próximo avanço"}
        </span>
        {clock.catchingUp ? (
          <>
            <b className="tm__next-time">{stuck ? "O avanço está demorando" : "O mundo está andando a semana"}</b>
            <p>{stuck ? "Atualize a página daqui a pouco para ver o mundo novo." : "A tela atualiza sozinha em instantes."}</p>
          </>
        ) : (
          <>
            <b className="tm__next-time">
              às {clock.nextLabel}
              <small>{until(nextMs - now)}</small>
            </b>
            <p>
              O mundo vai até <b>{short(new Date(cur.getTime() + clock.stepDays * DAY))}</b>. Até lá, aja na carreira: no avanço a energia volta a subir.
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
            : o tempo anda sozinho, {clock.stepDays} dias de jogo a cada {clock.stepHours} horas, nas horas pares de Brasília (0h, 2h, 4h…). Ninguém avança na mão, então quem fica fora não perde a vez.{" "}
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
