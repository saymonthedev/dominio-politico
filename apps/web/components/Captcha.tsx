"use client";
import { useEffect, useRef } from "react";

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

export const CAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
  });
  return loading;
}

/**
 * Verificação anti-robô (Cloudflare Turnstile). Só aparece quando a chave
 * pública está configurada; o token vai no campo "captchaToken" do formulário.
 * `reset` muda a cada envio, porque cada token só vale uma vez.
 */
export function Captcha({ reset }: { reset?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!CAPTCHA_SITE_KEY || !box.current) return;
    let id: string | null = null;
    let alive = true;
    loadScript()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return;
        id = window.turnstile.render(box.current, { sitekey: CAPTCHA_SITE_KEY, "response-field-name": "captchaToken", language: "pt-br", theme: "auto", size: "flexible" });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [reset]);
  if (!CAPTCHA_SITE_KEY) return null;
  return <div ref={box} className="captcha" />;
}
