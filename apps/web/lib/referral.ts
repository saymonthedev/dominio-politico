import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { simSecret, SITE_URL } from "./env";

/**
 * Convite de amigos e cartão de compartilhar (19/11): cada conta tem um código; o link de convite
 * leva para uma página com o cartão do jogador (a prévia do WhatsApp mostra o cartão) e para o
 * cadastro. Quem chega pelo link e assina dá 7 dias a quem convidou (banco: migração 0037).
 */

/** Cookie que guarda o convite enquanto a pessoa ainda não criou a conta. */
export const INVITE_COOKIE = "dp_convite";

export const isInviteCode = (v: unknown): v is string => typeof v === "string" && /^[0-9A-F]{7,20}$/i.test(v);

export const inviteUrl = (code: string, card?: string) => `${SITE_URL}/convite/${code}${card ? `?c=${card}` : ""}`;

/** O que o cartão mostra. Sai do estado do jogador no servidor e vai assinado (ninguém troca o texto). */
export interface ShareCard {
  /** rótulo de cima: "Minha carreira", "Eleita!", "Convite" */
  k: string;
  /** nome do personagem */
  n: string;
  /** a linha de destaque: cargo e lugar, ou a etapa da carreira */
  t: string;
  /** a linha de baixo: partido, mundo, conquistas */
  l: string;
  /** ano do ponto de partida */
  y: number;
}

const key = () => createHash("sha256").update(`${simSecret()}:cartao-de-convite`).digest();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

function sign(code: string, body: string): string {
  return createHmac("sha256", key()).update(`${code.toUpperCase()}.${body}`).digest("base64url").slice(0, 22);
}

/** Cartão assinado para ir no link (curto o bastante para a prévia e o WhatsApp). */
export function signCard(code: string, card: ShareCard): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  const body = b64(JSON.stringify({ k: clip(card.k, 30), n: clip(card.n, 40), t: clip(card.t, 70), l: clip(card.l, 90), y: card.y }));
  return `${body}.${sign(code, body)}`;
}

/** O cartão do link, se a assinatura confere; senão, null (a página mostra o convite sem cartão). */
export function readCard(code: string, token: string | null | undefined): ShareCard | null {
  if (!token || !isInviteCode(code)) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(sign(code, body));
  const got = Buffer.from(sig);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ShareCard;
    return typeof c.n === "string" && typeof c.t === "string" ? c : null;
  } catch {
    return null;
  }
}
