"use client";
import { useState } from "react";
import { Icon } from "../Icon";
import { Term } from "../Term";

export interface OnboardingStep {
  id: string;
  title: string;
  text: string;
  /** termo do glossário explicado no passo */
  term?: string;
  href: string;
  cta: string;
  done: boolean;
}

/** Primeiros passos no Painel: some sozinho quando tudo estiver feito ou quando o jogador esconder. */
export function Onboarding({ year, steps }: { year: number; steps: OnboardingStep[] }) {
  const [hidden, setHidden] = useState(false);
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  if (hidden || !next) return null;
  const hide = () => {
    // vale para este mundo, neste navegador, por um ano
    document.cookie = `dp_tutorial_${year}=off; path=/; max-age=31536000; samesite=lax`;
    setHidden(true);
  };
  return (
    <section className="onb mb" aria-labelledby="onb-title">
      <header className="onb__head">
        <div>
          <span className="onb__kicker">
            <Icon name="flag" size={14} /> Primeiros passos
          </span>
          <h2 id="onb-title">
            {done} de {steps.length} concluídos
          </h2>
        </div>
        <button type="button" className="onb__hide" onClick={hide}>
          Esconder
        </button>
      </header>
      <div className="onb__bar" role="progressbar" aria-label="Progresso dos primeiros passos" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}>
        <i style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="onb__steps">
        {steps.map((s) => (
          <li key={s.id} className={s.done ? "is-done" : s === next ? "is-next" : ""}>
            <span className="onb__mark" aria-hidden="true">
              {s.done ? <Icon name="check" size={14} /> : steps.indexOf(s) + 1}
            </span>
            <div>
              <b>
                {s.term ? <Term k={s.term}>{s.title}</Term> : s.title}
                {s.done && <span className="ui-sr"> (concluído)</span>}
              </b>
              <p>{s.text}</p>
              {s === next && (
                <a className="ui-btn ui-btn--gold ui-btn--sm" href={s.href}>
                  <span>{s.cta}</span>
                  <Icon name="arrow" size={14} />
                </a>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
