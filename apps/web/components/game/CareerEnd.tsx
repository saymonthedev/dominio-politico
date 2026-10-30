"use client";
import { useRef } from "react";
import type { CareerEndView } from "@/lib/sim";
import { useModal } from "../a11y";
import { Icon } from "../Icon";
import { dateLong, TAG } from "./story-ui";

const MON = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;
const yearOf = (iso: string) => iso.slice(0, 4);
const monthYear = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

/**
 * Pop-up do fim da carreira (morte ou aposentadoria): quem foi, o que
 * conquistou, por onde passou, as escolhas que fez e o que deixou.
 */
export function CareerEndModal({ summary: s, year, standalone }: { summary: CareerEndView; year: number; standalone?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, () => undefined, { lockScroll: !standalone, initial: ".obit__foot .ui-btn--gold" });
  const death = s.end.cause === "MORTE";
  const won = s.elections.filter((e) => e.won).length;
  const topAchievements = [...s.achievements].sort((a, b) => b.points - a.points).slice(0, 8);
  const tones = [
    { k: "safe", label: "prudentes", v: s.stats.safe },
    { k: "bold", label: "ousadas", v: s.stats.bold },
    { k: "risky", label: "arriscadas", v: s.stats.risky },
    { k: "illegal", label: "ilegais", v: s.stats.illegal },
  ];
  const toneMax = Math.max(1, ...tones.map((t) => t.v));

  return (
    <div className={`ui-overlay obit-overlay${standalone ? " is-page" : ""}`}>
      <article className="obit" role="dialog" aria-modal={!standalone} aria-labelledby="obit-name" ref={box}>
        <header className="obit__head">
          <span className="obit__kicker">
            <Icon name={death ? "star" : "flag"} size={14} /> {death ? "Fim da jornada" : "Fim da carreira"}
          </span>
          <h2 id="obit-name">{s.name}</h2>
          <p className="obit__years mono">
            {s.birthYear} – {s.endYear} · {s.end.age} anos · {s.city} ({s.uf})
          </p>
          <p className="obit__cause">{death ? `Morreu em ${dateLong(s.end.on)}, de ${s.end.detail}.` : `Deixou a vida pública em ${dateLong(s.end.on)}.`}</p>
          <div className="obit__title">
            <b>{s.title.label}</b>
            <span>{s.title.text}</span>
          </div>
        </header>

        <div className="obit__body">
          <blockquote className="obit__epitaph">{s.epitaph}</blockquote>

          <div className="obit__kpis">
            <div>
              <span>Maior cargo</span>
              <b>{s.highestOffice ?? "nenhum"}</b>
            </div>
            <div>
              <span>Eleições</span>
              <b className="mono">
                {won} de {s.elections.length}
              </b>
            </div>
            <div>
              <span>Pontos de carreira</span>
              <b className="mono">{s.points.toLocaleString("pt-BR")}</b>
            </div>
            <div>
              <span>Reputação final</span>
              <b className="mono">{s.reputation}</b>
            </div>
            <div>
              <span>Patrimônio</span>
              <b className="mono">{brl(s.wealth)}</b>
            </div>
          </div>

          <div className="obit__grid">
            <section>
              <h3>
                <Icon name="star" size={14} /> Maiores conquistas
              </h3>
              {topAchievements.length ? (
                <ul className="obit__list">
                  {topAchievements.map((a) => (
                    <li key={a.title}>
                      <b>{a.title}</b>
                      <small>
                        {a.text} · {monthYear(a.on)}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Nenhuma conquista registrada.</p>
              )}
            </section>

            <section>
              <h3>
                <Icon name="landmark" size={14} /> Cargos
              </h3>
              {s.offices.length ? (
                <ul className="obit__list">
                  {s.offices.map((o, i) => (
                    <li key={i}>
                      <b>{o.office}</b>
                      <small>
                        {o.place} · {yearOf(o.from)}–{yearOf(o.to)}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Não exerceu mandato.</p>
              )}
            </section>

            <section>
              <h3>
                <Icon name="ballot" size={14} /> Eleições
              </h3>
              {s.elections.length ? (
                <ul className="obit__list">
                  {s.elections.map((e, i) => (
                    <li key={i} className={e.won ? "is-won" : ""}>
                      <b>
                        {e.year} · {e.office}
                      </b>
                      <small>
                        {e.place} · {e.result}
                        {e.votes ? ` · ${e.votes.toLocaleString("pt-BR")} votos` : ""}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Nunca disputou uma eleição.</p>
              )}
            </section>

            <section>
              <h3>
                <Icon name="flag" size={14} /> Partidos
              </h3>
              {s.parties.length ? (
                <div className="obit__parties">
                  {s.parties.map((p, i) => (
                    <span key={i} className="obit__party" style={{ ["--c" as string]: p.color }}>
                      <b>{p.acronym}</b> {yearOf(p.from)}–{p.to ? yearOf(p.to) : yearOf(s.end.on)}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted small">Nunca se filiou.</p>
              )}
              <h3 className="mt">
                <Icon name="users" size={14} /> Aliados
              </h3>
              {s.allies.length ? (
                <ul className="obit__list">
                  {s.allies.map((a) => (
                    <li key={a.name}>
                      <b>{a.name}</b>
                      <small>{a.role ?? "aliado(a)"}</small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">Nenhuma aliança forte.</p>
              )}
              {s.enemies > 0 && <p className="muted small">Deixou {s.enemies} desafeto(s) pelo caminho.</p>}
            </section>
          </div>

          {s.milestones.length > 0 && (
            <section className="obit__timeline">
              <h3>
                <Icon name="clock" size={14} /> Marcos da trajetória
              </h3>
              <ol>
                {s.milestones.map((m) => (
                  <li key={m.id}>
                    <span className="mono">{monthYear(m.on)}</span>
                    <span>
                      <Icon name={TAG[m.tags[0]]?.icon ?? "star"} size={12} /> <b>{m.title}</b>
                      {m.choiceLabel ? <em> — {m.choiceLabel}</em> : null}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <div className="obit__grid obit__grid--2">
            <section>
              <h3>
                <Icon name="gavel" size={14} /> Escândalos
              </h3>
              {s.scandals.acts === 0 ? (
                <p className="obit__clean">
                  <Icon name="check" size={14} /> Nenhuma conduta ilegal em toda a carreira.
                </p>
              ) : (
                <p className="small">
                  {s.scandals.acts} conduta(s) ilegal(is), {s.scandals.discovered} descoberta(s); {s.scandals.cases} caso(s) na Justiça e {s.scandals.convictions} condenação(ões).
                  {s.scandals.kinds.length ? ` Acusações: ${s.scandals.kinds.join(", ").toLowerCase()}.` : ""}
                </p>
              )}
            </section>
            <section>
              <h3>
                <Icon name="sliders" size={14} /> Suas escolhas
              </h3>
              <p className="small" style={{ marginTop: 0 }}>
                {s.stats.events} acontecimento(s) em {s.stats.years} ano(s); {s.stats.ignored} ficaram sem resposta.
              </p>
              <div className="obit__tones">
                {tones.map((t) => (
                  <div key={t.k} className={`obit__tone obit__tone--${t.k}`}>
                    <span>{t.label}</span>
                    <i>
                      <em style={{ width: `${(t.v / toneMax) * 100}%` }} />
                    </i>
                    <b className="mono">{t.v}</b>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <footer className="obit__foot">
          <a className="ui-btn ui-btn--ghost" href="/jogo">
            <span>Seus mundos</span>
          </a>
          <a className="ui-btn ui-btn--gold" href={`/jogo/novo?ano=${year}`}>
            <Icon name="play" size={16} /> <span>Começar uma nova trajetória</span>
          </a>
        </footer>
      </article>
    </div>
  );
}
