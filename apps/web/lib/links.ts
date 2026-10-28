/** Links gravados pelo motor ("/jogo/carreira", "convite:<id>") viram rotas do mundo. */
export function resolveLink(link: string | null | undefined, year: number): string | null {
  if (!link) return null;
  if (link.startsWith("convite:")) return `/jogo/${year}/notificacoes`;
  if (link.startsWith("/jogo/")) return `/jogo/${year}/${link.slice("/jogo/".length)}`.replace(/\/$/, "");
  return link;
}

export function inviteIdOf(link: string | null | undefined): string | null {
  return link?.startsWith("convite:") ? link.slice("convite:".length) : null;
}
