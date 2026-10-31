"use client";
import { useMemo, useState } from "react";
import type { StoryLogEntry, StoryTag } from "@dp/engine";
import { Icon } from "../Icon";
import { DeltaChips } from "./ActionFx";
import { KIND, TAG } from "./story-ui";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const FILTERS: Array<{ id: string; label: string; tags?: StoryTag[]; milestones?: boolean }> = [
  { id: "todos", label: "Tudo" },
  { id: "marcos", label: "Marcos", milestones: true },
  { id: "partido", label: "Partido", tags: ["PARTIDO", "FILIACAO"] },
  { id: "campanha", label: "Campanhas", tags: ["CAMPANHA", "DEBATE", "ELEICAO"] },
  { id: "mandato", label: "Mandato", tags: ["MANDATO"] },
  { id: "comunidade", label: "Comunidade e imprensa", tags: ["COMUNIDADE", "IMPRENSA"] },
  { id: "vida", label: "Vida, trabalho e saúde", tags: ["VIDA", "TRABALHO", "SAUDE", "DINHEIRO"] },
  { id: "bastidores", label: "Bastidores", tags: ["BASTIDORES"] },
];

const monthLabel = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}`;

/** Histórico organizado da carreira: o que aconteceu, o que você escolheu e o que mudou. */
export function StoryHistory({ log }: { log: StoryLogEntry[] }) {
  const [filter, setFilter] = useState("todos");
  // abre só os mais recentes: no celular, 40 histórias davam milhares de pixels de rolagem
  const [limit, setLimit] = useState(12);
  const f = FILTERS.find((x) => x.id === filter)!;
  const items = useMemo(() => log.filter((e) => (f.milestones ? e.milestone : f.tags ? e.tags.some((t) => f.tags!.includes(t)) : true)), [log, f]);
  const groups = useMemo(() => {
    const out: Array<{ month: string; items: StoryLogEntry[] }> = [];
    for (const e of items.slice(0, limit)) {
      const m = e.on.slice(0, 7);
      if (out[out.length - 1]?.month !== m) out.push({ month: m, items: [] });
      out[out.length - 1].items.push(e);
    }
    return out;
  }, [items, limit]);

  if (!log.length) {
    return <p className="muted small" style={{ margin: 0 }}>Sua história ainda não começou. Passe o tempo no Painel: convites, crises, oportunidades e decisões vão aparecer.</p>;
  }
  return (
    <div className="sh">
      <div className="sh__filters" role="group" aria-label="Filtrar o histórico">
        {FILTERS.map((x) => (
          <button key={x.id} type="button" className={`sh__chip${x.id === filter ? " is-on" : ""}`} aria-pressed={x.id === filter} onClick={() => setFilter(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.month} className="sh__month">
            <h4>{monthLabel(g.month)}</h4>
            <ol>
              {g.items.map((e) => (
                <li key={e.id} className={`sh__item sh__item--${KIND[e.kind]?.tone ?? "info"}${e.milestone ? " is-milestone" : ""}`}>
                  <span className="sh__icon" aria-hidden="true">
                    <Icon name={e.milestone ? "star" : TAG[e.tags[0]]?.icon ?? "info"} size={14} />
                  </span>
                  <div>
                    <div className="sh__top">
                      <b>{e.title}</b>
                      <span className="mono">{e.on.slice(8, 10)}/{e.on.slice(5, 7)}</span>
                    </div>
                    {e.choiceLabel && (
                      <span className={`sh__choice${e.auto ? " is-auto" : ""}`}>
                        {e.auto ? "Sem resposta, valeu: " : "Você escolheu: "}
                        {e.choiceLabel}
                      </span>
                    )}
                    <p>{e.outcome}</p>
                    {e.deltas && e.deltas.length > 0 && <DeltaChips deltas={e.deltas} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      ) : (
        <p className="muted small">Nada neste filtro ainda.</p>
      )}
      {items.length > limit && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setLimit((n) => n + 30)}>
          <span>Mostrar mais ({items.length - limit})</span>
        </button>
      )}
    </div>
  );
}
