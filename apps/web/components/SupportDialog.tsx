"use client";
import { useEffect, useRef, useState } from "react";
import { useModal } from "./a11y";
import { Button } from "./forms";
import { Icon } from "./Icon";

/** O que a caixa de apoio mostra (vem do servidor: lib/pix.ts). */
export interface PixInfo {
  key: string;
  name: string;
  /** "Pix copia e cola" (BR Code) */
  code: string;
  /** QR Code do mesmo código, em SVG */
  qr: string;
}

/** Copia texto; sem a API do navegador (http, navegador antigo), seleciona e usa o comando antigo. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Chave, botões de copiar, instrução e QR Code: o miolo da caixa de apoio (pop-up do jogo e página /apoie). */
export function SupportPix({ pix }: { pix: PixInfo }) {
  const [copied, setCopied] = useState<"key" | "code" | "fail" | null>(null);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2600);
    return () => clearTimeout(t);
  }, [copied]);
  const copy = async (what: "key" | "code") => setCopied((await copyText(what === "key" ? pix.key : pix.code)) ? what : "fail");
  return (
    <>
      <div className="support__pix">
        <span className="support__label">Chave Pix (e-mail)</span>
        <code className="support__key">{pix.key}</code>
        <span className="support__to">
          em nome de <b>{pix.name}</b>
        </span>
      </div>

      <div className="support__copy">
        <Button type="button" tone="gold" icon="copy" onClick={() => copy("key")} data-copy-key="">
          {copied === "key" ? "Chave copiada!" : "Copiar chave Pix"}
        </Button>
        <Button type="button" tone="ghost" icon="copy" onClick={() => copy("code")}>
          {copied === "code" ? "Código copiado!" : "Copiar Pix copia e cola"}
        </Button>
      </div>
      <p className="support__how" role="status" aria-live="polite">
        {copied === "fail"
          ? "Não deu para copiar sozinho: selecione a chave acima e copie."
          : "No app do seu banco: Pix → Pagar com chave (cole a chave) ou Pix copia e cola (cole o código). Você escolhe o valor."}
      </p>

      <div className={`support__qr${showQr ? " is-open" : ""}`}>
        <button type="button" className="support__qr-toggle" onClick={() => setShowQr((v) => !v)} aria-expanded={showQr}>
          <Icon name="qr" size={16} /> {showQr ? "Esconder QR Code" : "Mostrar QR Code"}
        </button>
        {/* no computador o QR aparece direto; no celular, só se pedir (ninguém escaneia a própria tela) */}
        <figure className="support__qr-img" aria-label="QR Code do Pix">
          <span dangerouslySetInnerHTML={{ __html: pix.qr }} />
          <figcaption>Aponte a câmera do app do banco</figcaption>
        </figure>
      </div>
    </>
  );
}

/**
 * Caixa de apoio por Pix: chave para copiar, "Pix copia e cola" e QR Code. Sem intermediário e sem
 * pressão: o jogo é e continua grátis; doar é só para quem quiser.
 */
export function SupportDialog({ pix, onClose, reminder }: { pix: PixInfo; onClose: () => void; reminder?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useModal(box, true, onClose, { initial: "[data-copy-key]" });
  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog support" role="dialog" aria-modal="true" aria-labelledby="support-title" aria-describedby="support-text" ref={box}>
        <button type="button" className="support__close" onClick={onClose} aria-label="Fechar">
          <Icon name="x" size={18} />
        </button>
        <span className="ui-dialog__icon support__icon">
          <Icon name="heart" size={24} />
        </span>
        <h2 id="support-title">Apoie o Domínio Político</h2>
        <p id="support-text">
          O jogo é gratuito e feito por uma pessoa só. Com tanta gente jogando, manter os servidores no ar custa caro. Se você curte o jogo e quiser ajudar, qualquer
          valor por Pix faz diferença.
        </p>
        <p className="support__free">Doar é opcional: o jogo continua 100% grátis, com ou sem doação.</p>
        <SupportPix pix={pix} />
        <div className="ui-dialog__actions">
          <Button type="button" tone="ghost" onClick={onClose}>
            {reminder ? "Agora não" : "Fechar"}
          </Button>
        </div>
        {reminder && <p className="support__note">Este lembrete aparece no máximo uma vez por dia. Obrigado por jogar!</p>}
      </div>
    </div>
  );
}
