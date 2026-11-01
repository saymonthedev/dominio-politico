import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { RECOVER_SCRIPT } from "@/components/recover";
import { Signature } from "@/components/Signature";
import { TipLayer } from "@/components/TipLayer";
import { VersionWatch } from "@/components/VersionWatch";
import { AUTHOR } from "@/lib/author";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"], style: ["normal", "italic"], variable: "--font-poppins", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Domínio Político — jogo de política brasileira, do bairro ao Planalto", template: "%s · Domínio Político" },
  description:
    "Jogo de política brasileira, online e grátis: comece como cidadão em um Brasil real — a partir de 2002, 2006, 2010, 2014, 2018, 2022 ou 2026 — e construa uma carreira até a Presidência. Partidos, eleições, economia, imprensa, investigações e escândalos.",
  applicationName: "Domínio Político",
  authors: [{ name: AUTHOR.name, url: AUTHOR.site }],
  creator: AUTHOR.name,
  publisher: AUTHOR.name,
  openGraph: { type: "website", locale: "pt_BR", siteName: "Domínio Político" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
  // ocupa a tela toda no celular (barra de navegação de baixo respeita a área do gesto)
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${plexMono.variable}`}>
      <head>
        {/* recupera sozinho se a aba misturar versões do site depois de uma atualização */}
        <script dangerouslySetInnerHTML={{ __html: RECOVER_SCRIPT }} />
      </head>
      <body>
        {children}
        <TipLayer />
        <Signature />
        <VersionWatch />
        <Analytics />
      </body>
    </html>
  );
}
