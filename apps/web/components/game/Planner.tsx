"use client";
import { useRef, useState } from "react";
import type { ActionView } from "@/lib/actions-view";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";

/** Ação agendada para um dia do período: o relógio para nesse dia e a executa. */
export interface PlannedAction {
  id: string;
  label: string;
  date: string;
  params: Record<string, string>;
}

const DAY = 86_400_000;
const WD = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const iso = (start: string, n: number) => new Date(Date.parse(`${start}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const label = (d: string) => {
  const x = new Date(`${d}T12:00:00Z`);
  return `${WD[x.getUTCDay()]}, ${x.getUTCDate()} ${MON[x.getUTCMonth()]}`;
};

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
  useModal(box, true, onCancel, { lockScroll: true, initial: ".pl__go" });
  // hoje até o último dia do período
  const dates = Array.from({ length: days }, (_, i) => iso(start, i));
  const [rows, setRows] = useState<Record<string, Row | undefined>>({});
  const chosen = actions.filter((a) => rows[a.id]);
  const energyUse = chosen.reduce((s, a) => s + a.energy, 0);

  const toggle = (a: ActionView, date: string) =>
    setRows((r) => {
      if (!date) {
        const { [a.id]: _drop, ...rest } = r;
        return rest;
      }
      const params = r[a.id]?.params ?? Object.fromEntries(a.params.filter((p) => p.options?.length).map((p) => [p.name, p.options![0].value]));
      return { ...r, [a.id]: { date, params } };
    });
  const setParam = (a: ActionView, name: string, value: string) => setRows((r) => (r[a.id] ? { ...r, [a.id]: { ...r[a.id]!, params: { ...r[a.id]!.params, [name]: value } } } : r));

  const go = () =>
    onGo(
      chosen
        .map((a) => ({ id: a.id, label: a.label, date: rows[a.id]!.date, params: rows[a.id]!.params }))
        .sort((x, y) => x.date.localeCompare(y.date)),
    );

  return (
    <div className="ui-overlay pl-overlay">
      <div className="pl" role="dialog" aria-modal="true" aria-labelledby="pl-title" ref={box}>
        <header className="pl__head">
          <div>
            <span className="pl__kicker">
              <Icon name="calendar" size={14} /> Época de eleição
            </span>
            <h2 id="pl-title">
              Você vai passar {days === 1 ? "1 dia" : `${days} dias`}. Quer fazer algo nesse período?
            </h2>
            <p>Escolha o dia de cada ação. Quando o relógio chegar nele, ela acontece e entra no diário.</p>
          </div>
          <button type="button" className="pl__close" onClick={onCancel} aria-label="Fechar">
            <Icon name="x" size={18} />
          </button>
        </header>
        <ul className="pl__list">
          {actions.map((a) => {
            const row = rows[a.id];
            return (
              <li key={a.id} className={row ? "is-on" : undefined}>
                <div className="pl__info">
                  <b>{a.label}</b>
                  <small>{a.description}</small>
                  <span className="pl__cost">
                    −{a.energy} energia{a.cost ? ` · R$ ${Math.round(a.cost).toLocaleString("pt-BR")}` : ""}
                  </span>
                </div>
                <div className="pl__ctl">
                  <label>
                    <span>Dia</span>
                    <select value={row?.date ?? ""} onChange={(e) => toggle(a, e.target.value)}>
                      <option value="">Não fazer</option>
                      {dates.map((d) => (
                        <option key={d} value={d}>
                          {label(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {row &&
                    a.params
                      .filter((p) => p.options?.length)
                      .map((p) => (
                        <label key={p.name}>
                          <span>{p.label}</span>
                          <select value={row.params[p.name] ?? ""} onChange={(e) => setParam(a, p.name, e.target.value)}>
                            {p.options!.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                </div>
              </li>
            );
          })}
        </ul>
        <footer className="pl__foot">
          <span className={energyUse > energy + (days - 1) * 25 ? "pl__warn" : undefined}>
            {chosen.length ? `${chosen.length} ação(ões) · ${energyUse} de energia (você tem ${Math.round(energy)} e recupera 25 por dia)` : "Nenhuma ação agendada"}
          </span>
          <div>
            <Button tone="ghost" onClick={() => onGo([])}>
              Só passar o tempo
            </Button>
            <Button tone="gold" icon="play" className="pl__go" onClick={go} disabled={!chosen.length}>
              Passar com a agenda
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
