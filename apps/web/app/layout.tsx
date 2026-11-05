import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Poppins } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { RECOVER_SCRIPT } from "@/components/recover";
import { Signature } from "@/components/Signature";
import { TipLayer } from "@/components/TipLayer";
import { VersionWatch } from "@/components/VersionWatch";
import { AUTHOR } from "@/lib/author";
import { SITE_URL } from "@/lib/env";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "@/lib/seo";
import "./globals.css";

// Sem pré-carregar os arquivos de fonte: eram 17 (todos os pesos e o itálico) disputando a conexão
// com o que desenha a tela. O texto aparece na hora com a fonte reserva (ajustada para não pular) e
// cada página baixa só os pesos que usa. O peso 900 não é usado em lugar nenhum.
const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], style: ["normal", "italic"], variable: "--font-poppins", display: "swap", preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: AUTHOR.name, url: AUTHOR.site }],
  creator: AUTHOR.name,
  publisher: AUTHOR.name,
  openGraph: { type: "website", locale: "pt_BR", siteName: SITE_NAME, title: SITE_TITLE, description: SITE_DESCRIPTION },
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
