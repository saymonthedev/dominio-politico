/**
 * Veículos fictícios, explicitamente pertencentes ao universo da simulação.
 * Veículos reais só entram após clearance contratual (ver License Registry).
 */
export interface Outlet {
  id: string;
  name: string;
  kind: "JORNAL" | "TV" | "PORTAL" | "RADIO" | "AGENCIA";
  tone: "SOBRIO" | "POPULAR" | "ECONOMICO" | "REGIONAL";
  categories: string[];
}

export const OUTLETS: Outlet[] = [
  { id: "folha-planalto", name: "Folha do Planalto", kind: "JORNAL", tone: "SOBRIO", categories: ["politica", "eleicoes", "congresso", "investigacao"] },
  { id: "gazeta-nacional", name: "Gazeta Nacional", kind: "JORNAL", tone: "SOBRIO", categories: ["politica", "economia", "governo"] },
  { id: "rede-aurora", name: "Rede Aurora", kind: "TV", tone: "POPULAR", categories: ["eleicoes", "debates", "politica", "pais"] },
  { id: "canal-horizonte", name: "Canal Horizonte", kind: "TV", tone: "POPULAR", categories: ["debates", "pais", "investigacao"] },
  { id: "valor-capital", name: "Capital & Mercado", kind: "JORNAL", tone: "ECONOMICO", categories: ["economia", "mercado"] },
  { id: "portal-pauta", name: "Portal Pauta", kind: "PORTAL", tone: "POPULAR", categories: ["politica", "partidos", "local", "redes"] },
  { id: "agencia-tribuna", name: "Agência Tribuna", kind: "AGENCIA", tone: "SOBRIO", categories: ["eleicoes", "pesquisas", "congresso", "partidos"] },
  { id: "radio-cidade-viva", name: "Rádio Cidade Viva", kind: "RADIO", tone: "REGIONAL", categories: ["local", "partidos", "carreira"] },
  { id: "diario-regional", name: "Diário Regional", kind: "JORNAL", tone: "REGIONAL", categories: ["local", "carreira", "partidos", "eleicoes"] },
];

export const POLL_INSTITUTES = [
  { id: "vox-simulada", name: "Instituto Vox Simulada", house: 0.8 },
  { id: "datapainel", name: "DataPainel", house: -0.6 },
  { id: "quaest-fic", name: "Instituto Pulso Cívico", house: 0.2 },
  { id: "mira", name: "Mira Pesquisas", house: -0.2 },
];

export function outletsFor(category: string): Outlet[] {
  const list = OUTLETS.filter((o) => o.categories.includes(category));
  return list.length ? list : OUTLETS;
}
