import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { SITE_URL } from "@/lib/env";
import "./globals.css";

const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800", "900"], style: ["normal", "italic"], variable: "--font-poppins", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Domínio Político — simulador de carreira política brasileira", template: "%s · Domínio Político" },
  description:
    "Comece como cidadão em um Brasil real — a partir de 2002, 2006, 2010, 2014, 2018, 2022 ou 2026 — e construa uma carreira até a Presidência. Partidos, eleições, economia, imprensa, investigações e escândalos.",
  applicationName: "Domínio Político",
  openGraph: { type: "website", locale: "pt_BR", siteName: "Domínio Político" },
};

export const viewport: Viewport = {
  themeColor: "#0b1f3a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
