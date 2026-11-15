"use client";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import type { Urna as UrnaData, UrnaCandidate, UrnaOffice, UrnaParty } from "@dp/engine";
import { useModal } from "../a11y";
import { Button } from "../forms";
import { Icon } from "../Icon";
import { PersonAvatar } from "../PersonAvatar";

/** Um voto simbólico, guardado só neste aparelho. */
export interface UrnaVote {
  office: string;
  race: string;
  round: 1 | 2;
  title: string;
  kind: "CAND" | "LEGENDA" | "BRANCO" | "NULO";
  /** candidatura (voto nominal) */
  id?: string;
  /** partido (voto de legenda) */
  party?: string;
  label: string;
}

const STORE = "dp:urna";
const SOUND = "dp:urna:som";
type Store = Record<string, { at: number; votes: UrnaVote[] }>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Store;
  } catch {
    return {};
  }
}

/** Votos já dados nesta urna (null se ainda não votou). */
export function urnaVotes(key: string): UrnaVote[] | null {
  return readStore()[key]?.votes ?? null;
}

function saveVotes(key: string, votes: UrnaVote[]) {
  try {
    const s = readStore();
    s[key] = { at: Date.now(), votes };
    const keep = Object.entries(s)
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, 12);
    localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(keep)));
  } catch {
    // sem armazenamento no aparelho: o voto fica só nesta tela
  }
}

/** Votos do jogador numa disputa deste mundo, para marcar "seu voto" na apuração. */
export function votesForRace(world: string, race: string, round: 1 | 2): UrnaVote[] {
  for (const [key, v] of Object.entries(readStore())) {
    if (!key.startsWith(`${world}:`)) continue;
    const hit = v.votes.filter((x) => x.race === race && x.round === round);
    if (hit.length) return hit;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Som da urna: bipe a cada tecla, dois na troca de cargo e a sequência do FIM
// ---------------------------------------------------------------------------

type Note = [freq: number, ms: number];
const KEY: Note[] = [[1046, 55]];
const NEXT: Note[] = [[1046, 80], [0, 45], [1318, 110]];
const END: Note[] = [[1046, 85], [0, 35], [1046, 85], [0, 35], [1046, 85], [0, 35], [1046, 85], [0, 35], [1318, 520]];
const ERR: Note[] = [[330, 140]];

function useBeep() {
  const ctx = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(SOUND) !== "0");
    } catch {
      // segue com som
    }
  }, []);
  const play = useCallback(
    (notes: Note[]) => {
      if (!on) return;
      try {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        const ac = (ctx.current ??= new Ctor());
        if (ac.state === "suspended") void ac.resume();
        let t = ac.currentTime + 0.01;
        for (const [f, ms] of notes) {
          const len = ms / 1000;
          if (f > 0) {
            const o = ac.createOscillator();
            const g = ac.createGain();
            o.type = "square";
            o.frequency.value = f;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.035, t + 0.006);
            g.gain.setValueAtTime(0.035, t + Math.max(0.01, len - 0.02));
            g.gain.exponentialRampToValueAtTime(0.0001, t + len);
            o.connect(g).connect(ac.destination);
            o.start(t);
            o.stop(t + len + 0.02);
          }
          t += len;
        }
      } catch {
        // navegador sem áudio: a urna funciona calada
      }
    },
    [on],
  );
  const toggle = () => {
    const next = !on;
    setOn(next);
    try {
      localStorage.setItem(SOUND, next ? "1" : "0");
    } catch {
      // só nesta tela
    }
  };
  useEffect(() => () => void ctx.current?.close().catch(() => {}), []);
  return { play, on, toggle };
}

// ---------------------------------------------------------------------------
// O que a tela mostra para os números digitados
// ---------------------------------------------------------------------------

type Read =
  | { t: "empty" }
  | { t: "typing"; party?: UrnaParty; legenda: boolean }
  | { t: "cand"; c: UrnaCandidate }
  | { t: "legenda"; party: UrnaParty }
  | { t: "nulo" }
  | { t: "repeat"; c: UrnaCandidate }
  | { t: "branco" };

function read(o: UrnaOffice, digits: string, branco: boolean, taken?: string): Read {
  if (branco) return { t: "branco" };
  if (!digits) return { t: "empty" };
  const party = o.proportional && digits.length >= 2 ? o.parties.find((p) => String(p.number) === digits.slice(0, 2)) : undefined;
  if (digits.length < o.digits) return { t: "typing", party, legenda: !!party && digits.length === 2 };
  const c = o.candidates.find((x) => String(x.number) === digits);
  if (c) return c.id === taken ? { t: "repeat", c } : { t: "cand", c };
  // número de candidato que não existe, mas com partido certo: o voto vai para a legenda
  if (party) return { t: "legenda", party };
  return { t: "nulo" };
}

const canConfirm = (r: Read) => r.t === "cand" || r.t === "legenda" || r.t === "nulo" || r.t === "branco" || (r.t === "typing" && r.legenda);

function voteOf(o: UrnaOffice, round: 1 | 2, r: Read): UrnaVote {
  const base = { office: o.key, race: o.race, round, title: o.title };
  if (r.t === "cand") return { ...base, kind: "CAND", id: r.c.id, label: `${r.c.number} · ${r.c.name} (${r.c.party})` };
  if ((r.t === "legenda" || r.t === "typing") && r.party) return { ...base, kind: "LEGENDA", party: r.party.id, label: `legenda do ${r.party.acronym} (${r.party.number})` };
  if (r.t === "branco") return { ...base, kind: "BRANCO", label: "em branco" };
  return { ...base, kind: "NULO", label: "nulo" };
}

/**
 * Urna eletrônica simbólica: o jogador vota como eleitor em cada cargo da cédula, com teclado,
 * BRANCO, CORRIGE e CONFIRMA, e uma colinha com os números. Nada disso entra na contagem.
 */
export function Urna({ urna, doneLabel = "Fechar", onClose }: { urna: UrnaData; doneLabel?: string; onClose: (voted: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [digits, setDigits] = useState("");
  const [branco, setBranco] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [votes, setVotes] = useState<UrnaVote[]>([]);
  const [busy, setBusy] = useState(false);
  const { play, on, toggle } = useBeep();
  const fim = i >= urna.offices.length;
  const office = urna.offices[Math.min(i, urna.offices.length - 1)];
  // 2ª vaga do Senado: o mesmo nome não recebe os dois votos
  const taken = office.vaga === 2 ? votes.find((v) => v.race === office.race && v.kind === "CAND")?.id : undefined;
  const r = read(office, digits, branco, taken);
  const timer = useRef<number | null>(null);
  // no celular a colinha fica embaixo do teclado: a tela da urna volta à vista
  const toTop = () => box.current?.querySelector(".urna__body")?.scrollTo({ top: 0, behavior: "smooth" });
  useModal(box, true, () => onClose(fim), { lockScroll: true, initial: ".urna__act.is-confirma" });
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  // no FIM, o foco vai para o botão de seguir
  useEffect(() => {
    if (fim) box.current?.querySelector<HTMLElement>(".urna__foot button")?.focus();
  }, [fim]);

  const press = useCallback(
    (d: string) => {
      if (fim || busy) return;
      if (branco || digits.length >= office.digits) return play(ERR);
      setWarn(null);
      setDigits((x) => x + d);
      play(KEY);
    },
    [fim, busy, branco, digits.length, office.digits, play],
  );
  const corrige = useCallback(() => {
    if (fim || busy) return;
    setDigits("");
    setBranco(false);
    setWarn(null);
    play(KEY);
  }, [fim, busy, play]);
  const votaBranco = useCallback(() => {
    if (fim || busy) return;
    if (digits) {
      setWarn("Para votar em BRANCO, o campo de voto deve estar vazio. Aperte CORRIGE para apagar o número.");
      return play(ERR);
    }
    setWarn(null);
    setBranco(true);
    play(KEY);
  }, [fim, busy, digits, play]);
  const confirma = useCallback(() => {
    if (fim || busy) return;
    if (!canConfirm(r)) {
      if (r.t === "repeat") setWarn("Este nome já recebeu seu voto na 1ª vaga. Aperte CORRIGE e escolha outro.");
      return play(ERR);
    }
    const all = [...votes, voteOf(office, urna.round, r)];
    setVotes(all);
    setWarn(null);
    setBusy(true);
    const last = i + 1 >= urna.offices.length;
    if (last) {
      saveVotes(urna.key, all);
      play(END);
    } else play(NEXT);
    // a urna segura a tela um instante antes do próximo cargo, como a de verdade
    timer.current = window.setTimeout(
      () => {
        setI(i + 1);
        setDigits("");
        setBranco(false);
        setBusy(false);
        toTop();
      },
      last ? 250 : 650,
    );
  }, [fim, busy, r, votes, office, urna.round, urna.offices.length, urna.key, i, play]);

  // teclado físico: números, Backspace (CORRIGE), Enter (CONFIRMA) e B (BRANCO)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        return press(e.key);
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        return corrige();
      }
      // Enter confirma; num botão focado (menos as teclas de número) vale o clique do próprio botão
      if (e.key === "Enter" && (!target?.closest("button, a, summary") || target.closest(".urna__key"))) {
        e.preventDefault();
        return confirma();
      }
      if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        return votaBranco();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [press, corrige, confirma, votaBranco]);

  // clique com o mouse devolve o foco à urna: o Enter seguinte confirma, e não repete o botão clicado
  const tap = (fn: () => void) => (e: MouseEvent<HTMLButtonElement>) => {
    fn();
    if (e.detail > 0) box.current?.focus({ preventScroll: true });
  };

  const pick = (n: number) => {
    if (fim || busy) return;
    setBranco(false);
    setWarn(null);
    setDigits(String(n));
    play(KEY);
    toTop();
  };

  const showHelp = !fim && (r.t === "cand" || r.t === "legenda" || r.t === "nulo" || r.t === "branco" || (r.t === "typing" && r.legenda));
  const cand = r.t === "cand" || r.t === "repeat" ? r.c : null;
  const party = r.t === "legenda" || r.t === "typing" ? r.party : undefined;

  return (
    <div className="ui-overlay urna-overlay">
      <div className={`urna${fim ? " is-fim" : ""}`} role="dialog" aria-modal="true" aria-labelledby="urna-title" ref={box} tabIndex={-1}>
        <header className="urna__head">
          <span className="urna__kicker">
            <Icon name="ballot" size={14} /> Urna · voto simbólico
            {!fim && (
              <span className="urna__step">
                {i + 1} de {urna.offices.length}
              </span>
            )}
          </span>
          <h2 id="urna-title">
            {urna.round}º turno de {urna.year} · {urna.place}
          </h2>
          <p>Vote como eleitor(a), inclusive em você. Este voto não entra na contagem do jogo.</p>
        </header>

        <div className="urna__body">
          <div className="urna__device">
            <div className="urna__screen" aria-live="polite" aria-atomic="true">
              {fim ? (
                <div className="urna__fim">
                  <b>FIM</b>
                  <small>VOTOU</small>
                </div>
              ) : (
                <>
                  <div className="urna__top">
                    <div className="urna__main">
                      <small className="urna__seu">Seu voto para</small>
                      <strong className="urna__cargo">{office.title}</strong>
                      <div className="urna__digits" aria-label={digits ? `Número: ${digits.split("").join(" ")}` : "Nenhum número digitado"}>
                        {Array.from({ length: office.digits }, (_, k) => (
                          <span key={k} className={`urna__digit${!branco && k === digits.length ? " is-cursor" : ""}`}>
                            {digits[k] ?? ""}
                          </span>
                        ))}
                      </div>
                      {cand && (
                        <dl className="urna__info">
                          <div>
                            <dt>Nome:</dt>
                            <dd>{cand.name}</dd>
                          </div>
                          <div>
                            <dt>Partido:</dt>
                            <dd>{cand.party}</dd>
                          </div>
                          {cand.mates?.map((m) => (
                            <div key={m.label}>
                              <dt>{m.label}:</dt>
                              <dd>{m.name}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {!cand && party && (
                        <dl className="urna__info">
                          <div>
                            <dt>Partido:</dt>
                            <dd>
                              {party.acronym} · {party.name}
                            </dd>
                          </div>
                        </dl>
                      )}
                    </div>
                    {cand && (
                      <div className="urna__photo">
                        <PersonAvatar name={cand.name} photo={cand.photo ? { src: cand.photo, year: urna.year } : null} avatar={cand.avatar} size={74} />
                        <small>{cand.photo ? "Foto: TSE (CC-BY)" : office.title.split(" · ")[0]}</small>
                      </div>
                    )}
                  </div>

                  <div className="urna__msg">
                    {r.t === "branco" && <b className="urna__big">Voto em branco</b>}
                    {r.t === "nulo" && (
                      <>
                        <b>Número errado</b>
                        <b className="urna__big urna__blink">Voto nulo</b>
                      </>
                    )}
                    {r.t === "legenda" && (
                      <>
                        <b>Número errado</b>
                        <b className="urna__big">Voto de legenda</b>
                      </>
                    )}
                    {r.t === "typing" && r.legenda && <span>CONFIRMA agora vota só na legenda; ou continue digitando o número do(a) candidato(a).</span>}
                    {r.t === "empty" && <span className="urna__hint">Digite o número ou toque num nome da colinha.</span>}
                    {cand?.me && <em className="urna__you">é você</em>}
                    {warn && <span className="urna__warn">{warn}</span>}
                  </div>

                  {showHelp && (
                    <div className="urna__help">
                      <span>Aperte a tecla:</span>
                      <span>
                        <b className="is-green">CONFIRMA</b> para CONFIRMAR este voto
                      </span>
                      <span>
                        <b className="is-orange">CORRIGE</b> para REINICIAR este voto
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="urna__pad">
              <span className="urna__brand" aria-hidden="true">
                Domínio Político
              </span>
              <div className="urna__keys" role="group" aria-label="Teclado numérico">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"].map((d) => (
                  <button key={d} type="button" className="urna__key" onClick={tap(() => press(d))} disabled={fim}>
                    {d}
                  </button>
                ))}
              </div>
              <div className="urna__acts">
                <button type="button" className="urna__act is-branco" onClick={tap(votaBranco)} disabled={fim}>
                  Branco
                </button>
                <button type="button" className="urna__act is-corrige" onClick={tap(corrige)} disabled={fim}>
                  Corrige
                </button>
                <button type="button" className="urna__act is-confirma" onClick={tap(confirma)} disabled={fim}>
                  Confirma
                </button>
              </div>
            </div>
          </div>

          {fim ? (
            <section className="urna__sum" aria-labelledby="urna-sum">
              <h3 id="urna-sum">Seus votos</h3>
              <ol>
                {votes.map((v) => (
                  <li key={v.office}>
                    <small>{v.title}</small>
                    <b>{v.label}</b>
                  </li>
                ))}
              </ol>
              <p>Simbólico: ficam só neste aparelho e aparecem marcados na apuração.</p>
            </section>
          ) : (
            <Colinha office={office} taken={taken} onPick={(n) => tap(() => pick(n))} />
          )}
        </div>

        <footer className="urna__foot">
          <button type="button" className="urna__sound" onClick={toggle} aria-pressed={on}>
            {on ? "Som ligado" : "Som desligado"}
          </button>
          {fim ? (
            <Button tone="gold" icon="arrow" onClick={() => onClose(true)}>
              {doneLabel}
            </Button>
          ) : (
            <button type="button" className="urna__leave" onClick={() => onClose(false)}>
              Sair sem votar
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

/** A colinha do cargo: candidaturas com número e, nos proporcionais, as legendas. */
function Colinha({ office, taken, onPick }: { office: UrnaOffice; taken?: string; onPick: (n: number) => (e: MouseEvent<HTMLButtonElement>) => void }) {
  const list = office.candidates.filter((c) => c.id !== taken);
  return (
    <section className="urna__cola" aria-labelledby="urna-cola">
      <h3 id="urna-cola">
        <Icon name="file" size={14} /> Colinha · {office.title}
      </h3>
      {list.length > 0 ? (
        <ul className="urna__names">
          {list.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={onPick(c.number)}>
                <span className="mono">{c.number}</span>
                <b>{c.name}</b>
                <small>{c.party}</small>
                {c.me && <em>você</em>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="urna__none">Nenhuma candidatura com número próprio aqui: vote na legenda (os 2 números do partido), em branco ou anule.</p>
      )}
      {office.proportional && office.parties.length > 0 && (
        <>
          <p className="urna__legend">Legendas: os 2 números do partido e CONFIRMA</p>
          <ul className="urna__parties">
            {office.parties.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={onPick(p.number)} title={p.name}>
                  <span className="mono">{p.number}</span> {p.acronym}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
