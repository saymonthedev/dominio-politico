"use client";
import { useEffect, useRef, useState } from "react";
import { useModal } from "./a11y";
import { Button } from "./forms";
import { Icon } from "./Icon";

export interface ShareData {
  /** link do convite (com o cartão do jogador na prévia) */
  link: string;
  text: string;
  /** imagem em pé (story) */
  story: string;
}

/**
 * Compartilhar o jogo (19/11): botão que abre o cartão do jogador pronto para o story e o WhatsApp,
 * com o link de convite. Quem entra pelo link e assina dá 7 dias a quem convidou.
 */
export function ShareButton({ share, label = "Compartilhar", tone = "ghost" }: { share: ShareData; label?: string; tone?: "ghost" | "gold" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" tone={tone} size="sm" icon="share" onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <ShareDialog share={share} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ShareDialog({ share, onClose, title = "Mostre a sua carreira" }: { share: ShareData; onClose: () => void; title?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [busy, setBusy] = useState(false);
  useModal(box, true, onClose);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function"), []);
  const message = `${share.text} ${share.link}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // sem permissão: o link continua selecionável na tela
    }
  };

  // no celular: manda a imagem do cartão junto (story, status, qualquer app); sem isso, o texto e o link
  const native = async () => {
    setBusy(true);
    try {
      const blob = await fetch(share.story).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
      const file = blob ? new File([blob], "dominio-politico.png", { type: blob.type || "image/png" }) : null;
      if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], text: message });
      else await navigator.share({ text: share.text, url: share.link });
    } catch {
      // a pessoa desistiu de compartilhar
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ui-dialog sharebox" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={box}>
        <div className="sharebox__body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="sharebox__img" src={share.story} alt="Cartão do seu personagem para o story" width={270} height={480} />
          <div className="sharebox__side">
            <h2 id="share-title">{title}</h2>
            <p className="muted small">
              Poste o cartão no story ou mande no WhatsApp. <b>A cada amigo que entrar pelo seu link e assinar, você ganha 7 dias de jogo.</b>
            </p>
            <div className="sharebox__actions">
              {canShare && (
                <Button type="button" tone="gold" icon="share" loading={busy} onClick={native}>
                  Compartilhar
                </Button>
              )}
              <a className="ui-btn ui-btn--ghost" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener">
                <Icon name="chat" size={16} /> <span>Mandar no WhatsApp</span>
              </a>
              <a className="ui-btn ui-btn--ghost" href={share.story} download="dominio-politico.png">
                <Icon name="download" size={16} /> <span>Baixar imagem para o story</span>
              </a>
            </div>
            <div className="sharebox__link">
              <span className="mono">{share.link.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</span>
              <Button type="button" tone="ghost" size="sm" icon={copied ? "check" : "copy"} onClick={copy}>
                {copied ? "Copiado!" : "Copiar link"}
              </Button>
            </div>
          </div>
        </div>
        <div className="ui-dialog__actions">
          <Button type="button" tone="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </div>
  );
}
