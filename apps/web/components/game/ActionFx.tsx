"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { quickAction, type ActionDelta, type ActionState } from "@/app/jogo/actions";
import { STAGE_LABEL } from "../ui";
import { Icon } from "../Icon";
import { useToast } from "./Toaster";

/** O que aparece enquanto a ação acontece, por categoria (alterna a cada ~0,9 s). */
const PHRASES: Record<string, string[]> = {
  BASE: ["Saindo de casa…", "Conversando com o bairro…", "Apertando mãos…"],
  PARTIDO: ["Batendo na porta do partido…", "Conversando com a direção…", "Esperando a resposta…"],
  CAMPANHA: ["Subindo no palanque…", "Falando com o eleitor…", "Contando as reações…"],
  MANDATO: ["Indo ao plenário…", "Protocolando…", "Articulando os votos…"],
  INVESTIGACAO: ["Puxando a ficha…", "Cruzando documentos…", "Ligando os pontos…"],
  ESQUEMA: ["Acertando por baixo dos panos…", "Movendo o dinheiro…", "Apagando o rastro…"],
  MEU_PARTIDO: ["Reunindo a executiva…", "Ajustando a chapa…", "Registrando a decisão…"],
  FINANCAS: ["Abrindo o extrato…", "Fechando as contas…", "Registrando a operação…"],
};
const GENERIC = ["Agindo…", "Processando o dia…", "Registrando…"];

/** Tempo mínimo de "ação acontecendo": rápido demais não parece que algo aconteceu. */
const MIN_MS = 750;

const fmtDelta = (d: ActionDelta) => {
  const sign = d.value > 0 ? "+" : "−";
  const abs = Math.abs(d.value);
  return d.money ? `${sign}R$ ${Math.round(abs).toLocaleString("pt-BR")}` : `${sign}${abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}`;
};

/** Ganho (verde), custo (âmbar) ou perigo (vermelho). */
const toneOf = (d: ActionDelta) => (d.bad ? (d.value > 0 ? "bad" : "good") : d.key === "energia" || (d.key === "caixa" && d.value < 0) ? (d.value < 0 ? "cost" : "good") : d.value > 0 ? "good" : "bad");

export function DeltaChips({ deltas, float }: { deltas: ActionDelta[]; float?: boolean }) {
  if (!deltas.length) return null;
  return (
    <span className={`dchips${float ? " dchips--float" : ""}`}>
      {deltas.map((d, i) => (
        <span key={d.key} className={`dchip dchip--${toneOf(d)}`} style={{ ["--i" as string]: i }}>
          <b>{fmtDelta(d)}</b> {d.label}
        </span>
      ))}
    </span>
  );
}

/** Avisa o resto da tela (comemoração de etapa) sem acoplar componentes. */
function announce(r: ActionState) {
  if (r.ok && (r.stage || r.party)) window.dispatchEvent(new CustomEvent("dp:milestone", { detail: { stage: r.stage, party: r.party } }));
}

/**
 * Executa uma ação do jogo com começo, meio e fim: frases de progresso enquanto roda,
 * resultado com o que mudou (energia, caixa, reputação…) e comemoração se a carreira avançar.
 */
/** Uma ação por vez em toda a tela: enquanto uma acontece, as outras esperam. */
let busyNow = false;
const busySubs = new Set<() => void>();
function setBusy(v: boolean) {
  busyNow = v;
  for (const f of busySubs) f();
}
const subscribeBusy = (f: () => void) => {
  busySubs.add(f);
  return () => void busySubs.delete(f);
};

/** Há alguma ação do jogo em andamento (em qualquer cartão)? */
export function useActionBusy(): boolean {
  return useSyncExternalStore(subscribeBusy, () => busyNow, () => false);
}

export function useGameAction(year: number, category?: string) {
  const [, start] = useTransition();
  // "acontecendo" vai do clique até a resposta; a página atualizada chega logo depois, sem segurar o cartão
  const [running, setRunning] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [result, setResult] = useState<ActionState | null>(null);
  const toast = useToast();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const busy = useActionBusy();
  const run = (actionId: string, params: Record<string, string>, label: string, after?: (r: ActionState) => void) => {
    if (busyNow) {
      toast({ tone: "err", title: "Uma coisa de cada vez", body: "Espere a ação em andamento terminar." });
      return;
    }
    setBusy(true);
    const list = PHRASES[category ?? ""] ?? GENERIC;
    let k = 0;
    setResult(null);
    setRunning(true);
    setPhrase(list[0]);
    timer.current = setInterval(() => setPhrase(list[++k % list.length]), 900);
    start(async () => {
      const t0 = Date.now();
      // a ação chama revalidatePath: a resposta já traz a página atualizada (sem um segundo refresh)
      const r = await quickAction(year, actionId, params).catch((e: unknown) => ({ ok: false, message: e instanceof Error ? e.message : "Erro ao executar a ação." }) as ActionState);
      const wait = MIN_MS - (Date.now() - t0);
      if (wait > 0) await new Promise((ok) => setTimeout(ok, wait));
      if (timer.current) clearInterval(timer.current);
      setRunning(false);
      setBusy(false);
      setResult(r);
      toast({ tone: r.ok ? "ok" : "err", title: r.ok ? label : "Não deu certo", body: r.message, deltas: r.ok ? r.deltas : undefined });
      announce(r);
      after?.(r);
    });
  };
  const clear = useCallback(() => setResult(null), []);
  // outra ação em andamento: este cartão espera
  return { run, pending: running, locked: busy && !running, phrase, result, clear };
}

/** Tela de comemoração quando a ação muda a etapa da carreira ou o partido. */
export function Milestone() {
  const [m, setM] = useState<{ stage?: ActionState["stage"]; party?: ActionState["party"] } | null>(null);
  useEffect(() => {
    const on = (e: Event) => setM((e as CustomEvent).detail);
    window.addEventListener("dp:milestone", on);
    return () => window.removeEventListener("dp:milestone", on);
  }, []);
  useEffect(() => {
    if (!m) return;
    const t = setTimeout(() => setM(null), 4200);
    return () => clearTimeout(t);
  }, [m]);
  if (!m) return null;
  const up = m.stage;
  const title = up ? STAGE_LABEL[up.to] ?? up.to : m.party?.to ? `Agora você é do ${m.party.to}` : "Você saiu do partido";
  const kicker = up ? "Nova etapa" : "Filiação";
  return (
    <div className="milestone" role="status" onClick={() => setM(null)}>
      <div className="milestone__card">
        <span className="milestone__rays" aria-hidden="true" />
        <span className="milestone__icon">
          <Icon name={up ? "star" : "flag"} size={30} />
        </span>
        <small>{kicker}</small>
        <b>{title}</b>
        {up && m.party?.to && <span>e agora filiado(a) ao {m.party.to}</span>}
        {up && !m.party && <span>{STAGE_LABEL[up.from] ?? up.from} → {STAGE_LABEL[up.to] ?? up.to}</span>}
      </div>
    </div>
  );
}

/** Número que corre até o novo valor e pisca verde/vermelho quando muda (energia, caixa, reputação). */
export function LiveNumber({ value, format = (v) => Math.round(v).toLocaleString("pt-BR") }: { value: number; format?: (v: number) => string }) {
  const [shown, setShown] = useState(value);
  const [flash, setFlash] = useState<"" | "up" | "down">("");
  const from = useRef(value);
  useEffect(() => {
    const a = from.current;
    if (a === value) return;
    from.current = value;
    setFlash(value > a ? "up" : "down");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setShown(value);
    } else {
      const t0 = performance.now();
      const dur = 700;
      let raf = 0;
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        setShown(a + (value - a) * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
      const t = setTimeout(() => setFlash(""), 1200);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    }
    const t = setTimeout(() => setFlash(""), 1200);
    return () => clearTimeout(t);
  }, [value]);
  return <span className={`livenum${flash ? ` livenum--${flash}` : ""}`}>{format(shown)}</span>;
}
