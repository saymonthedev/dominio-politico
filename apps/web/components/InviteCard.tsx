"use client";
import { useState } from "react";
import { Icon } from "./Icon";
import { ShareDialog, type ShareData } from "./ShareButton";

/**
 * Convide amigos (Minha conta): o link à vista com cópia em um toque, WhatsApp, o cartão para o
 * story e como funciona. Os números aparecem quando alguém já entrou pelo link.
 */
export function InviteCard({ share, invited, rewarded, trial }: { share: ShareData; invited: number; rewarded: number; trial: string }) {
  const [dialog, setDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const shortLink = share.link.replace(/^https?:\/\//, "").replace(/\?.*$/, "");
  const message = `${share.text} ${share.link}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(share.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_500);
    } catch {
      // sem permissão: o link continua à vista para copiar à mão
    }
  };
  return (
    <>
      <section className="ivc" id="convite" aria-labelledby="ivc-title">
        <div className="ivc__main">
          <span className="ivc__kicker">
            <Icon name="gift" size={15} /> Convide amigos
          </span>
          <h2 className="ivc__title" id="ivc-title">
            Ganhe <em>7 dias de jogo</em> por amigo
          </h2>
          <p className="ivc__lead">Seu amigo cria a conta pelo seu link e joga {trial} grátis. Quando ele assinar, os 7 dias entram na sua assinatura na hora.</p>

          <div className="ivc__link">
            <Icon name="link" size={16} />
            <span className="mono" title={share.link}>
              {shortLink}
            </span>
            <button type="button" onClick={copy} aria-live="polite">
              <Icon name={copied ? "check" : "copy"} size={15} /> {copied ? "Copiado" : "Copiar"}
            </button>
          </div>

          <div className="ivc__actions">
            <a className="ui-btn ui-btn--gold" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener">
              <Icon name="chat" size={17} /> <span>Mandar no WhatsApp</span>
            </a>
            <button type="button" className="ui-btn ivc__ghost" onClick={() => setDialog(true)}>
              <Icon name="share" size={17} /> <span>Cartão para o story</span>
            </button>
          </div>

          <ol className="ivc__steps">
            <li>
              <b>1</b>
              <span>Mande o link ou poste o cartão</span>
            </li>
            <li>
              <b>2</b>
              <span>O amigo cria a conta e joga {trial} grátis</span>
            </li>
            <li>
              <b>3</b>
              <span>Ele assina e você ganha 7 dias</span>
            </li>
          </ol>

          {invited > 0 && (
            <div className="ivc__stats">
              <div>
                <b className="mono">{invited}</b>
                <span>{invited === 1 ? "amigo entrou" : "amigos entraram"}</span>
              </div>
              <div>
                <b className="mono">{rewarded}</b>
                <span>{rewarded === 1 ? "assinou" : "assinaram"}</span>
              </div>
              <div>
                <b className="mono">{rewarded * 7}</b>
                <span>dias ganhos</span>
              </div>
            </div>
          )}
        </div>

        <button type="button" className="ivc__preview" onClick={() => setDialog(true)} aria-label="Abrir o cartão para o story">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={share.story} alt="" width={180} height={320} loading="lazy" />
          <span>Seu cartão</span>
        </button>
      </section>
      {/* fora do cartão: a janela usa as cores do tema, não as do cartão */}
      {dialog && <ShareDialog share={share} title="Seu cartão de convite" onClose={() => setDialog(false)} />}
    </>
  );
}
