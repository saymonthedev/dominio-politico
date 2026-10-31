"use client";
import { useRef, useState } from "react";
import type { ActionView } from "@/lib/actions-view";
import { useModal } from "../a11y";
import { Button, Select } from "../forms";
import { Icon } from "../Icon";

/** Ação agendada para um dia do período: o relógio para nesse dia e a executa. */
export interface PlannedAction {
  id: string;
  label: string;
  date: string;
  params: Record<string, string>;
}

const DAY = 86_400_000;
const WD_SHORT = ["D", "S", "T", "Q", "Q", "S", "S"];
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const plus = (start: string, n: number) => new Date(Date.parse(`${start}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const asDate = (d: string) => new Date(`${d}T12:00:00Z`);
const nice = (d: string) => {
  const x = asDate(d);
  return `${WD[x.getUTCDay()]}, ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
};

/** Calendário do período: só os dias que vão passar podem ser escolhidos. */
function Calendar({ first, last, value, busy, onPick }: { first: string; last: string; value?: string; busy: Set<string>; onPick: (d: string) => void }) {
  const a = asDate(first);
  const months: Array<{ y: number; m: number }> = [];
  for (let y = a.getUTCFullYear(), m = a.getUTCMonth(); ; ) {
    months.push({ y, m });
    const end = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    if (end >= last) break;
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return (
    <div className="pcal">
      {months.map(({ y, m }) => {
        const lead = new Date(Date.UTC(y, m, 1)).getUTCDay();
        const count = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
        return (
          <div key={`${y}-${m}`} className="pcal__month">
            <b className="pcal__title">
              {MONTHS[m]} {y}
            </b>
            <div className="pcal__grid" role="grid">
              {WD_SHORT.map((w, i) => (
                <span key={`h${i}`} className="pcal__wd" aria-hidden="true">
                  {w}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`e${i}`} />
              ))}
              {Array.from({ length: count }, (_, i) => {
                const d = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                const inside = d >= first && d <= last;
                return (
                  <button
                    key={d}
                    type="button"
                    className={`pcal__day${d === value ? " is-sel" : ""}${d === first ? " is-today" : ""}${busy.has(d) ? " is-busy" : ""}`}
                    disabled={!inside}
                    aria-pressed={d === value}
                    aria-label={nice(d)}
                    onClick={() => onPick(d)}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface Row {
  date: string;
  params: Record<string, string>;
}

/**
 * Antes de passar o tempo em época de eleição: o que você quer fazer e em que
 * dia. Cada ação acontece no dia escolhido, no meio do diário.
 */
export function Planner({ days, start, energy, actions, onCancel, onGo }: { days: number; start: string; energy: number; actions: ActionView[]; onCancel: () => void; onGo: (plan: PlannedAction[]) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, onCancel, { lockScroll: true, initial: ".pl__skip" });
  const last = plus(start, days - 1);
  const [rows, setRows] = useState<Record<string, Row | undefined>>({});
  const [picking, setPicking] = useState<string | null>(null);
  const chosen = actions.filter((a) => rows[a.id]);
  const energyUse = chosen.reduce((s, a) => s + a.energy, 0);
  const busy = new Set(chosen.map((a) => rows[a.id]!.date));

  const pick = (a: ActionView, date: string) => {
    setRows((r) => ({ ...r, [a.id]: { date, params: r[a.id]?.params ?? Object.fromEntries(a.params.filter((p) => p.options?.length).map((p) => [p.name, p.options![0].value])) } }));
    setPicking(null);
  };
  const remove = (a: ActionView) =>
    setRows((r) => {
      const { [a.id]: _gone, ...rest } = r;
      return rest;
    });
  const setParam = (a: ActionView, name: string, value: string) => setRows((r) => (r[a.id] ? { ...r, [a.id]: { ...r[a.id]!, params: { ...r[a.id]!.params, [name]: value } } } : r));

  const go = () => onGo(chosen.map((a) => ({ id: a.id, label: a.label, date: rows[a.id]!.date, params: rows[a.id]!.params })).sort((x, y) => x.date.localeCompare(y.date)));

  return (
    <div className="ui-overlay pl-overlay">
      <div className="pl" role="dialog" aria-modal="true" aria-labelledby="pl-title" ref={box}>
        <header className="pl__head">
          <div>
            <span className="pl__kicker">
              <Icon name="calendar" size={14} /> Época de eleição · {nice(start)} a {nice(last)}
            </span>
            <h2 id="pl-title">Você vai passar {days === 1 ? "1 dia" : `${days} dias`}. Quer fazer algo nesse período?</h2>
            <p>Escolha o dia de cada ação no calendário. Quando o relógio chegar nele, ela acontece e entra no diário.</p>
          </div>
          <button type="button" className="pl__close" onClick={onCancel} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </header>

        <ul className="pl__list">
          {actions.map((a) => {
            const row = rows[a.id];
            const open = picking === a.id;
            return (
              <li key={a.id} className={`pl__item${row ? " is-on" : ""}${open ? " is-open" : ""}`}>
                <div className="pl__top">
                  <div className="pl__info">
                    <b>{a.label}</b>
                    <small>{a.description}</small>
                    <span className="pl__chips">
                      <i>
                        <Icon name="zap" size={11} /> {a.energy} energia
                      </i>
                      {a.cost ? <i>R$ {Math.round(a.cost).toLocaleString("pt-BR")}</i> : null}
                    </span>
                  </div>
                  {row ? (
                    <div className="pl__when">
                      <button type="button" className="pl__date" onClick={() => setPicking(open ? null : a.id)} aria-expanded={open}>
                        <Icon name="calendar" size={14} /> {nice(row.date)}
                      </button>
                      <button type="button" className="pl__remove" onClick={() => remove(a)} aria-label={`Tirar ${a.label} da agenda`}>
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="pl__add" onClick={() => setPicking(open ? null : a.id)} aria-expanded={open}>
                      <Icon name="calendar" size={14} /> Agendar
                    </button>
                  )}
                </div>
                {open && <Calendar first={start} last={last} value={row?.date} busy={busy} onPick={(d) => pick(a, d)} />}
                {row && a.params.some((p) => p.options?.length) && (
                  <div className="pl__params">
                    {a.params
                      .filter((p) => p.options?.length)
                      .map((p) => (
                        <Select key={p.name} name={`${a.id}-${p.name}`} label={p.label} options={p.options!} defaultValue={row.params[p.name]} onChange={(v) => setParam(a, p.name, v)} />
                      ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <footer className="pl__foot">
          <span className={energyUse > energy + (days - 1) * 25 ? "pl__warn" : undefined}>
            {chosen.length ? `${chosen.length} na agenda · ${energyUse} de energia (você tem ${Math.round(energy)} e recupera 25 por dia)` : "Nada agendado ainda"}
          </span>
          <div>
            <Button tone="ghost" className="pl__skip" onClick={() => onGo([])}>
              Só passar o tempo
            </Button>
            <Button tone="gold" icon="play" onClick={go} disabled={!chosen.length}>
              Passar com a agenda
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
