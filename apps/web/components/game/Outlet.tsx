/**
 * Marcas dos veículos fictícios do jogo: um selo com símbolo próprio e o nome
 * escrito no estilo do tipo de veículo (jornal, TV, portal, rádio, agência).
 */

type Kind = "jornal" | "tv" | "portal" | "radio" | "agencia";

interface Brand {
  kind: Kind;
  color: string;
  ink?: string;
  glyph: React.ReactNode;
}

const serif = { fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700 } as const;

const BRANDS: Record<string, Brand> = {
  "Folha do Planalto": {
    kind: "jornal",
    color: "#1f3a6d",
    glyph: (
      <>
        <text x="12" y="17" textAnchor="middle" fontSize="15" style={serif} fill="currentColor">F</text>
        <path d="M5 20.5h14" stroke="currentColor" strokeWidth="1.4" />
      </>
    ),
  },
  "Gazeta Nacional": {
    kind: "jornal",
    color: "#8c2a2a",
    glyph: (
      <>
        <path d="M4 5.5h16M4 19.5h16" stroke="currentColor" strokeWidth="1.2" />
        <text x="12" y="16.5" textAnchor="middle" fontSize="12" style={serif} fill="currentColor">GN</text>
      </>
    ),
  },
  "Rede Aurora": {
    kind: "tv",
    color: "#e2702c",
    glyph: (
      <>
        <path d="M5 16a7 7 0 0 1 14 0z" fill="currentColor" />
        <path d="M12 5v2.5M5.6 8.2l1.7 1.6M18.4 8.2l-1.7 1.6M3.5 18.5h17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  "Canal Horizonte": {
    kind: "tv",
    color: "#127c7a",
    glyph: (
      <>
        <circle cx="12" cy="10" r="4" fill="currentColor" />
        <path d="M3.5 15.5h17M6 19h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
  "Capital & Mercado": {
    kind: "jornal",
    color: "#1d6b45",
    glyph: (
      <>
        <path d="M4.5 17l5-5 3 3 6.5-7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15 8h4v4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
  },
  "Portal Pauta": {
    kind: "portal",
    color: "#6a3fc8",
    glyph: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="800" fontFamily="system-ui, sans-serif" fill="currentColor">p</text>
      </>
    ),
  },
  "Agência Tribuna": {
    kind: "agencia",
    color: "#3d4f66",
    glyph: (
      <>
        <path d="M4 9l8-4 8 4z" fill="currentColor" />
        <path d="M6.5 10.5v6M10 10.5v6M14 10.5v6M17.5 10.5v6M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
  },
  "Rádio Cidade Viva": {
    kind: "radio",
    color: "#d9a514",
    ink: "#1b1b1b",
    glyph: (
      <>
        <circle cx="12" cy="13" r="2.2" fill="currentColor" />
        <path d="M8.2 9.2a5.4 5.4 0 0 0 0 7.6M15.8 9.2a5.4 5.4 0 0 1 0 7.6M5.4 6.4a9.4 9.4 0 0 0 0 13.2M18.6 6.4a9.4 9.4 0 0 1 0 13.2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },
  "Diário Regional": {
    kind: "jornal",
    color: "#7a4a22",
    glyph: (
      <>
        <text x="12" y="16.5" textAnchor="middle" fontSize="12" style={serif} fill="currentColor">DR</text>
        <path d="M6 19.5h12" stroke="currentColor" strokeWidth="1.2" />
      </>
    ),
  },
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

function brandOf(name: string): Brand {
  return (
    BRANDS[name] ?? {
      kind: "jornal",
      color: "#4b5563",
      glyph: (
        <text x="12" y="16" textAnchor="middle" fontSize="11" style={serif} fill="currentColor">
          {initials(name) || "N"}
        </text>
      ),
    }
  );
}

/** Selo quadrado do veículo. */
export function OutletBadge({ name, size = 28 }: { name: string; size?: number }) {
  const b = brandOf(name);
  return (
    <span className="olog__badge" style={{ width: size, height: size, background: b.color, color: b.ink ?? "#fff" }} aria-hidden="true">
      <svg viewBox="0 0 24 24" width={size * 0.78} height={size * 0.78}>
        {b.glyph}
      </svg>
    </span>
  );
}

/** Selo + nome no estilo do veículo. */
export function OutletLogo({ name, size = 22 }: { name: string; size?: number }) {
  const b = brandOf(name);
  return (
    <span className={`olog olog--${b.kind}`}>
      <OutletBadge name={name} size={size} />
      <span className="olog__name">{name}</span>
    </span>
  );
}
