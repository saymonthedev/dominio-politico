/** Quem criou o jogo: créditos e links de divulgação. */
export const AUTHOR = {
  name: "Saymon Oliveira",
  initials: "SO",
  /** foto do site do autor (128 px, quadrada) */
  photo: "/autor.webp",
  handle: "@saymonthedev",
  site: "https://saymonthedev.com",
  siteLabel: "saymonthedev.com",
  instagram: "https://www.instagram.com/saymonthedev/",
} as const;

/** Link para o site do autor com a origem marcada (o analytics do site mostra de onde veio a visita). */
export function authorSite(where: string): string {
  return `${AUTHOR.site}/?utm_source=dominio-politico&utm_medium=credito&utm_campaign=${encodeURIComponent(where)}`;
}
