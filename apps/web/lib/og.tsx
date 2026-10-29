import { ImageResponse } from "next/og";

/** Tamanho padrão das prévias de link (WhatsApp, redes sociais, buscadores). */
export const OG_SIZE = { width: 1200, height: 630 };

const LOGO =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173763"/><stop offset="1" stop-color="#0b1f3a"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><rect x=".75" y=".75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5"/><rect x="27.2" y="13" width="4" height="31" rx="1" fill="#d4a53c"/><rect x="32.8" y="13" width="4" height="31" rx="1" fill="#f4d58d"/><rect x="27.2" y="24" width="9.6" height="2.4" fill="#d4a53c"/><path d="M9.5 36.5h16a8 7.5 0 0 1-16 0z" fill="#f4d58d"/><path d="M38.5 44a8 7.5 0 0 1 16 0z" fill="#d4a53c"/><rect x="8" y="44" width="48" height="3.2" rx="1.6" fill="#ffffff"/></svg>',
  ).toString("base64");

/** Poppins do Google Fonts (TTF); sem rede, a imagem sai com a fonte padrão. */
async function poppins(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Poppins:wght@${weight}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

export interface OgContent {
  kicker: string;
  title: string;
  accent?: string;
  lede: string;
  /** barra do 2º turno: [vencedor, rival] */
  duel?: { winner: string; winnerShare: number; winnerColor: string; rival: string; rivalShare: number; rivalColor: string };
}

export async function ogImage({ kicker, title, accent, lede, duel }: OgContent): Promise<ImageResponse> {
  const [bold, regular] = await Promise.all([poppins(800), poppins(400)]);
  const fonts = [
    ...(bold ? [{ name: "Poppins", data: bold, weight: 800 as const, style: "normal" as const }] : []),
    ...(regular ? [{ name: "Poppins", data: regular, weight: 400 as const, style: "normal" as const }] : []),
  ];
  const pct = (v: number) => `${v.toFixed(1).replace(".", ",")}%`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", position: "relative", background: "linear-gradient(160deg, #10284b 0%, #0b1f3a 60%, #081629 100%)", color: "#fff", fontFamily: "Poppins", padding: "56px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} width={64} height={64} alt="" />
          <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -0.5 }}>
            Domínio&nbsp;<span style={{ color: "#d4a53c" }}>Político</span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 54, fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#d4a53c" }}>{kicker}</div>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: title.endsWith("-") ? 0 : 22, marginTop: 12, fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
          <span>{title}</span>
          {accent && <span style={{ color: "#d4a53c" }}>{accent}</span>}
        </div>
        <div style={{ display: "flex", marginTop: 22, fontSize: 28, lineHeight: 1.4, color: "#c7d2e3", maxWidth: 1000 }}>{lede}</div>
        {duel && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24 }}>
              <span>
                {duel.winner} · {pct(duel.winnerShare)}
              </span>
              <span style={{ color: "#c7d2e3" }}>
                {duel.rival} · {pct(duel.rivalShare)}
              </span>
            </div>
            <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden" }}>
              <div style={{ width: `${duel.winnerShare}%`, background: duel.winnerColor }} />
              <div style={{ width: `${duel.rivalShare}%`, background: duel.rivalColor, opacity: 0.7 }} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, bottom: 0, height: 10, background: "#d4a53c" }} />
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}
