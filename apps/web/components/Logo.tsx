/** Marca: escudo com degraus ascendentes (carreira) e estrela (poder). Desenho próprio. */
export function LogoMark({ size = 36, title = "Domínio Político" }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title}>
      <path d="M32 4 L56 12 V31 C56 45.5 46 55.5 32 60 C18 55.5 8 45.5 8 31 V12 Z" fill="#0b1f3a" stroke="#d4a53c" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="17.5" y="38" width="7.5" height="12" rx="1" fill="#d4a53c" />
      <rect x="28.25" y="30.5" width="7.5" height="19.5" rx="1" fill="#d4a53c" />
      <rect x="39" y="23" width="7.5" height="27" rx="1" fill="#e9c46a" />
      <rect x="15.5" y="50" width="33" height="2.6" rx="1.3" fill="#d4a53c" />
      <polygon points="42.50,8.90 43.91,12.56 47.83,12.77 44.78,15.24 45.79,19.03 42.50,16.90 39.21,19.03 40.22,15.24 37.17,12.77 41.09,12.56" fill="#f4d58d" />
    </svg>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <a className="brand" href={href}>
      <LogoMark size={38} />
      <span className="word">
        Domínio Político
        <em>simulador de carreira</em>
      </span>
    </a>
  );
}
