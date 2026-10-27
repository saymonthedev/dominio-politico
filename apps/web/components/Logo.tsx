/**
 * Marca: o Congresso Nacional estilizado (torres, cúpula do Senado e cuia da
 * Câmara) num selo arredondado. Desenho próprio, sem reproduzir logotipos oficiais.
 */
export const LOGO_PATHS = `<rect x="27.2" y="13" width="4" height="31" rx="1" fill="#d4a53c"/><rect x="32.8" y="13" width="4" height="31" rx="1" fill="#f4d58d"/><rect x="27.2" y="24" width="9.6" height="2.4" fill="#d4a53c"/><path d="M9.5 36.5h16a8 7.5 0 0 1-16 0z" fill="#f4d58d"/><path d="M38.5 44a8 7.5 0 0 1 16 0z" fill="#d4a53c"/><rect x="8" y="44" width="48" height="3.2" rx="1.6" fill="#ffffff"/>`;

export function LogoMark({ size = 36, title = "Domínio Político" }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <defs>
        <linearGradient id="dp-logo-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#173763" />
          <stop offset="1" stopColor="#0b1f3a" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#dp-logo-bg)" />
      <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" fill="none" stroke="#ffffff" strokeOpacity=".12" strokeWidth="1.5" />
      <g dangerouslySetInnerHTML={{ __html: LOGO_PATHS }} />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a className="brand" href={href}>
      <LogoMark size={36} />
      <span className="word">
        Domínio <span>Político</span>
      </span>
    </a>
  );
}
