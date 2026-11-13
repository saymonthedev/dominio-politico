"use client";
import { useEffect, useState } from "react";
import { checkPix, startPix } from "@/app/assinar/actions";
import type { PixCharge } from "@/lib/payments";
import { fmtDay } from "@/lib/format";
import { Button } from "./forms";
import { Icon } from "./Icon";

type Phase = "idle" | "creating" | "waiting" | "paid" | "expired";

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Pagamento da assinatura: gera o Pix, mostra o QR Code e o copia e cola, e confere sozinho a cada
 * poucos segundos (com a aba à vista). Caiu o pagamento: agradece e libera o jogo na hora.
 */
export function Checkout({ price, days, renew }: { price: number; days: number; renew: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [charge, setCharge] = useState<PixCharge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const start = async () => {
    setError(null);
    setPhase("creating");
    const r = await startPix().catch(() => ({ ok: false as const, message: "Sem conexão. Tente de novo." }));
    if (!r.ok) {
      setError(r.message);
      setPhase("idle");
      return;
    }
    setCharge(r.charge);
    setNow(Date.now());
    setPhase("waiting");
  };

  // confere o pagamento a cada 4 s (10 s depois de um erro), até cair ou o Pix vencer
  useEffect(() => {
    if (phase !== "waiting" || !charge) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (Date.parse(charge.expiresAt) < Date.now()) return setPhase("expired");
      if (document.visibilityState !== "visible") {
        timer = setTimeout(tick, 4_000);
        return;
      }
      const r = await checkPix(charge.id).catch(() => ({ status: "error", paidUntil: null }));
      if (stop) return;
      if (r.status === "approved") {
        setUntil(r.paidUntil);
        setPhase("paid");
        return;
      }
      if (r.status === "rejected" || r.status === "cancelled") {
        setError("O pagamento não foi aprovado. Gere outro Pix.");
        setPhase("idle");
        return;
      }
      timer = setTimeout(tick, r.status === "error" ? 10_000 : 4_000);
    };
    timer = setTimeout(tick, 4_000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [phase, charge]);

  // contagem do vencimento do Pix
  useEffect(() => {
    if (phase !== "waiting") return;
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, [phase]);

  const copy = async () => {
    if (!charge) return;
    try {
      await navigator.clipboard.writeText(charge.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // sem permissão para a área de transferência: o código continua selecionável na tela
    }
  };

  if (phase === "paid") {
    return (
      <div className="pay__done" role="status">
        <Icon name="check" size={34} />
        <h2>Pagamento confirmado!</h2>
        <p>
          Muito obrigado por apoiar o Domínio Político. É a sua assinatura que mantém os servidores no ar e o jogo crescendo.
          {until ? ` Sua assinatura vale até ${fmtDay(until)}.` : ""}
        </p>
        <a className="ui-btn ui-btn--gold" href="/jogo">
          <Icon name="play" size={16} /> <span>Ir para o jogo</span>
        </a>
      </div>
    );
  }

  if ((phase === "waiting" || phase === "expired") && charge) {
    const left = Date.parse(charge.expiresAt) - now;
    return (
      <div className="pay__card">
        {phase === "expired" ? (
          <p className="pay__err">Este Pix venceu sem pagamento. Gere outro para continuar.</p>
        ) : (
          <div className="pay__qr">
            <img src={`data:image/png;base64,${charge.qr}`} alt="QR Code do Pix de R$ 3" width={200} height={200} />
            <div className="pay__copy">
              <b>Pix copia e cola</b>
              <div className="pay__code">{charge.code}</div>
              <Button type="button" tone="gold" icon={copied ? "check" : "copy"} onClick={copy}>
                {copied ? "Copiado!" : "Copiar código"}
              </Button>
              <p className="pay__fine">Abra o app do seu banco, escolha Pix e pague com o QR Code ou com o código copiado.</p>
            </div>
          </div>
        )}
        {phase === "waiting" ? (
          <p className="pay__wait" role="status" aria-live="polite">
            <span className="ui-spinner" aria-hidden="true" /> Esperando o pagamento. Assim que o Pix cair, o jogo libera sozinho (o código vale por mais {mmss(left)}).
          </p>
        ) : (
          <Button type="button" tone="gold" icon="qr" onClick={start}>
            Gerar outro Pix
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="pay__card">
      <p className="pay__price">
        <b>R$ {price}</b>
        <span>por {days} dias de jogo</span>
      </p>
      <Button type="button" tone="gold" size="lg" icon="qr" loading={phase === "creating"} onClick={start} disabled={phase === "creating"}>
        {renew ? `Renovar por mais ${days} dias` : "Pagar com Pix"}
      </Button>
      {error && (
        <p className="pay__err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
