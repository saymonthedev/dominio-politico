import type { Metadata } from "next";

export const SITE_NAME = "Domínio Político";
export const SITE_TITLE = "Domínio Político — jogo de política brasileira, do bairro ao Planalto";
/** Até ~155 caracteres: o Google corta o resto na busca. */
export const SITE_DESCRIPTION =
  "Jogo de política brasileira online: comece como cidadão num Brasil real (2002 a 2026) e chegue à Presidência. Eleições, partidos, campanhas e escândalos.";

const OG_BASE = { type: "website", locale: "pt_BR", siteName: SITE_NAME } as const;
/** Imagem de compartilhamento do site (app/opengraph-image); páginas com imagem própria a substituem. */
const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, alt: "Domínio Político: simulador de carreira política brasileira" };

/**
 * Metadados de uma página pública: título, descrição própria (sem repetir a do site), endereço
 * canônico e cartão de compartilhamento completo (o da página substitui o do site inteiro, então
 * tipo, idioma e nome do site vão junto). Telas de conta saem com `index: false`.
 */
export function pageMeta({
  title,
  description,
  path,
  shareTitle,
  image,
  index = true,
}: {
  title: string;
  description: string;
  path: string;
  shareTitle?: string;
  /** imagem de compartilhamento própria da página (ex.: /partida/2026/opengraph-image) */
  image?: string;
  index?: boolean;
}): Metadata {
  const share = shareTitle ?? `${title} · ${SITE_NAME}`;
  const img = image ? { ...SHARE_IMAGE, url: image, alt: share } : SHARE_IMAGE;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...OG_BASE, url: path, title: share, description, images: [img] },
    twitter: { card: "summary_large_image", title: share, description, images: [img.url] },
    ...(index ? {} : { robots: { index: false, follow: true } }),
  };
}

/** Página inicial: o título do site sem o sufixo. */
export const homeMeta: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OG_BASE, url: "/", title: SITE_TITLE, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
};
