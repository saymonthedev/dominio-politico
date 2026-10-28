/**
 * Logos dos partidos (Wikimedia Commons, licenças livres registradas em logos.json).
 * Chaves "SIGLA@ANO" são versões antigas, válidas até aquele ano de ponto de partida.
 */
import data from "./logos.json";

export interface PartyLogo {
  src: string;
  w: number;
  h: number;
  file: string;
  page: string;
  license: string;
  author: string;
}

const LOGOS = data as Record<string, PartyLogo>;
const ALIAS: Record<string, string> = { "PC do B": "PCDOB", SD: "SOLIDARIEDADE" };

/** Logo da sigla no ano do ponto de partida (a versão mais antiga que ainda valia naquele ano). */
export function logoOf(acronym: string | null | undefined, year?: number): PartyLogo | null {
  if (!acronym) return null;
  const key = ALIAS[acronym] ?? acronym.toUpperCase();
  if (year) {
    const old = Object.keys(LOGOS)
      .filter((k) => k.startsWith(`${key}@`) && Number(k.split("@")[1]) >= year)
      .sort((a, b) => Number(a.split("@")[1]) - Number(b.split("@")[1]))[0];
    if (old) return LOGOS[old];
  }
  return LOGOS[key] ?? null;
}

/** Lista para a página de fontes: sigla (com o período, se for versão antiga) e o registro da licença. */
export const LOGO_CREDITS = Object.entries(LOGOS).map(([key, logo]) => {
  const [acronym, until] = key.split("@");
  return { acronym, label: until ? `${acronym} (até ${until})` : acronym, ...logo, license: logo.license === "Public domain" ? "Domínio público" : logo.license };
});
