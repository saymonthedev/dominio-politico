/**
 * Ilustrações dos bens (moradia e veículo), desenhadas em SVG no estilo do jogo: leves, sem fotos de
 * terceiros nem marcas, e com cores que acompanham o tema claro e o escuro (variáveis --art-*).
 */

type ArtProps = { className?: string; title?: string };

function Frame({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <svg className={`art${className ? ` ${className}` : ""}`} viewBox="0 0 160 100" role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect width="160" height="100" fill="var(--art-sky)" />
      <circle cx="22" cy="17" r="8" fill="var(--art-sun)" />
      <rect y="84" width="160" height="16" fill="var(--art-ground)" />
      {children}
    </svg>
  );
}

/** Moradia por padrão: 0 quitinete, 1 simples, 2 médio, 3 alto, 4 luxo; "RUA" sem endereço. */
export function HomeArt({ tier, kind, className, title }: ArtProps & { tier: number; kind?: string }) {
  if (kind === "RUA") {
    return (
      <Frame label={title ?? "Sem endereço"} className={className}>
        <rect x="34" y="24" width="3" height="60" fill="var(--art-metal)" />
        <path d="M35.5 25 Q36 16 45 16 L51 16" stroke="var(--art-metal)" strokeWidth="3" fill="none" />
        <rect x="48" y="14" width="11" height="5" rx="1.5" fill="var(--art-metal)" />
        <ellipse cx="53.5" cy="31" rx="13" ry="10" fill="var(--art-sun)" opacity=".35" />
        <rect x="70" y="55" width="54" height="3.5" rx="1" fill="var(--art-door)" />
        <rect x="70" y="63" width="54" height="4" rx="1" fill="var(--art-door)" />
        <rect x="74" y="67" width="3" height="17" fill="var(--art-metal)" />
        <rect x="117" y="67" width="3" height="17" fill="var(--art-metal)" />
        <rect x="128" y="71" width="13" height="13" rx="3" fill="var(--art-wall2)" />
        <rect x="131" y="74" width="7" height="3" rx="1" fill="var(--art-frame)" opacity=".4" />
      </Frame>
    );
  }
  const t = Math.max(0, Math.min(4, Math.round(tier)));
  const label = title ?? ["Quitinete ou quarto", "Imóvel simples", "Imóvel de médio padrão", "Imóvel de alto padrão", "Casa de luxo"][t];
  return (
    <Frame label={label} className={className}>
      {t === 0 && (
        <>
          <rect x="12" y="44" width="36" height="40" fill="var(--art-wall2)" />
          <rect x="112" y="36" width="38" height="48" fill="var(--art-wall2)" />
          {[52, 66].map((y) => [18, 32].map((x) => <rect key={`a${x}${y}`} x={x} y={y} width="9" height="7" fill="var(--art-win)" opacity=".8" />))}
          {[44, 58, 72].map((y) => [118, 134].map((x) => <rect key={`b${x}${y}`} x={x} y={y} width="9" height="7" fill="var(--art-win)" opacity=".8" />))}
          <rect x="50" y="18" width="60" height="66" fill="var(--art-wall3)" />
          <rect x="50" y="18" width="60" height="4" fill="var(--art-frame)" opacity=".35" />
          <rect x="92" y="9" width="13" height="9" rx="1" fill="var(--art-frame)" opacity=".55" />
          {[26, 38, 50, 62].map((y) => [57, 75, 93].map((x) => <rect key={`c${x}${y}`} x={x} y={y} width="10" height="8" fill="var(--art-win)" />))}
          <path d="M56 35 L68 35" stroke="var(--art-frame)" strokeWidth=".7" />
          <rect x="58" y="35" width="3" height="4" fill="var(--art-roof)" />
          <rect x="63" y="35" width="3" height="5" fill="var(--art-water)" />
          <rect x="74" y="72" width="12" height="12" fill="var(--art-door)" />
        </>
      )}
      {t === 1 && (
        <>
          <rect x="44" y="50" width="72" height="34" fill="var(--art-wall)" />
          <polygon points="38,52 80,26 122,52" fill="var(--art-roof)" />
          <rect x="74" y="62" width="13" height="22" fill="var(--art-door)" />
          <rect x="52" y="60" width="15" height="12" fill="var(--art-win)" stroke="var(--art-frame)" strokeWidth="1" />
          <rect x="94" y="60" width="15" height="12" fill="var(--art-win)" stroke="var(--art-frame)" strokeWidth="1" />
          <rect x="22" y="78" width="44" height="6" fill="var(--art-wall2)" />
          <rect x="94" y="78" width="44" height="6" fill="var(--art-wall2)" />
          <circle cx="30" cy="71" r="7" fill="var(--art-plant)" />
          <circle cx="132" cy="72" r="6" fill="var(--art-plant2)" />
        </>
      )}
      {t === 2 && (
        <>
          <rect x="40" y="22" width="80" height="62" fill="var(--art-wall)" />
          <rect x="40" y="22" width="80" height="4" fill="var(--art-wall2)" />
          {[30, 46, 62].map((y) => (
            <g key={y}>
              <rect x="48" y={y} width="20" height="11" fill="var(--art-win)" />
              <rect x="92" y={y} width="20" height="11" fill="var(--art-win)" />
              <rect x="46" y={y + 11} width="24" height="2.5" fill="var(--art-frame)" opacity=".7" />
              <rect x="90" y={y + 11} width="24" height="2.5" fill="var(--art-frame)" opacity=".7" />
            </g>
          ))}
          <rect x="73" y="66" width="14" height="18" fill="var(--art-glass)" stroke="var(--art-frame)" strokeWidth="1" />
          <rect x="134" y="66" width="4" height="18" fill="var(--art-door)" />
          <circle cx="136" cy="60" r="12" fill="var(--art-plant)" />
          <rect x="20" y="70" width="4" height="14" fill="var(--art-door)" />
          <circle cx="22" cy="66" r="9" fill="var(--art-plant2)" />
        </>
      )}
      {t === 3 && (
        <>
          <rect x="26" y="50" width="76" height="34" fill="var(--art-wall)" />
          <rect x="52" y="29" width="80" height="23" fill="var(--art-wall2)" />
          <rect x="50" y="26" width="84" height="4" fill="var(--art-frame)" />
          <rect x="60" y="34" width="64" height="12" fill="var(--art-glass)" />
          <rect x="32" y="57" width="40" height="22" fill="var(--art-glass)" />
          <line x1="52" y1="57" x2="52" y2="79" stroke="var(--art-frame)" strokeWidth="1.2" />
          <rect x="104" y="58" width="34" height="26" fill="var(--art-frame)" opacity=".78" />
          {[63, 69, 75].map((y) => (
            <line key={y} x1="106" y1={y} x2="136" y2={y} stroke="var(--art-wall2)" strokeWidth="1" opacity=".55" />
          ))}
          <rect x="14" y="78" width="88" height="6" rx="3" fill="var(--art-plant)" />
        </>
      )}
      {t === 4 && (
        <>
          <rect x="18" y="44" width="104" height="32" fill="var(--art-wall)" />
          <rect x="40" y="27" width="64" height="19" fill="var(--art-wall)" />
          <rect x="36" y="24" width="72" height="4" fill="var(--art-frame)" />
          <rect x="14" y="41" width="112" height="4" fill="var(--art-frame)" />
          <rect x="46" y="31" width="52" height="10" fill="var(--art-glass)" />
          <rect x="24" y="50" width="92" height="20" fill="var(--art-glass)" />
          {[47, 70, 93].map((x) => (
            <line key={x} x1={x} y1="50" x2={x} y2="70" stroke="var(--art-frame)" strokeWidth="1.2" />
          ))}
          <rect x="10" y="76" width="122" height="8" fill="var(--art-wall2)" />
          <rect x="22" y="78" width="72" height="5" rx="2" fill="var(--art-water)" />
          <path d="M137 84 C135 70 135 56 139 40" stroke="var(--art-door)" strokeWidth="3" fill="none" strokeLinecap="round" />
          <g fill="var(--art-plant)">
            <ellipse cx="129" cy="41" rx="12" ry="4" transform="rotate(-20 129 41)" />
            <ellipse cx="149" cy="41" rx="12" ry="4" transform="rotate(20 149 41)" />
            <ellipse cx="133" cy="35" rx="11" ry="3.5" transform="rotate(-55 133 35)" />
            <ellipse cx="145" cy="35" rx="11" ry="3.5" transform="rotate(55 145 35)" />
          </g>
        </>
      )}
    </Frame>
  );
}

function Wheel({ x, y = 77, r = 9, rim = 4 }: { x: number; y?: number; r?: number; rim?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="var(--art-tire)" />
      <circle cx={x} cy={y} r={rim} fill="var(--art-rim)" />
      <circle cx={x} cy={y} r={Math.max(1.2, rim / 3)} fill="var(--art-tire)" />
    </>
  );
}

const CAR_LABEL: Record<string, string> = {
  moto: "Moto 160 cc",
  popular_usado: "Carro popular usado",
  popular_novo: "Carro popular 0 km",
  medio: "Sedã ou SUV médio",
  luxo: "SUV importado de luxo",
};

/** Veículo por modelo do jogo (moto, popular usado, popular 0 km, médio, luxo). */
export function VehicleArt({ model, className, title }: ArtProps & { model: string }) {
  const label = title ?? CAR_LABEL[model] ?? "Veículo";
  return (
    <Frame label={label} className={className}>
      {model === "moto" && (
        <>
          <ellipse cx="81" cy="87" rx="46" ry="2.6" fill="var(--art-shadow)" />
          <path d="M36 66 Q44 57 57 59" stroke="#c0392b" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M70 69 L40 67" stroke="var(--art-rim)" strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="48" cy="72" r="12" fill="none" stroke="var(--art-tire)" strokeWidth="5" />
          <circle cx="114" cy="72" r="12" fill="none" stroke="var(--art-tire)" strokeWidth="5" />
          <circle cx="48" cy="72" r="3" fill="var(--art-rim)" />
          <circle cx="114" cy="72" r="3" fill="var(--art-rim)" />
          <path d="M48 72 L68 58 L96 58 L114 72" stroke="var(--art-metal)" strokeWidth="3" fill="none" strokeLinejoin="round" />
          <rect x="72" y="58" width="17" height="11" rx="2" fill="#6b7280" />
          <line x1="114" y1="72" x2="104" y2="43" stroke="var(--art-rim)" strokeWidth="3" strokeLinecap="round" />
          <path d="M70 53 Q73 44 86 45 L97 48 Q99 54 95 57 L72 57 Z" fill="#c0392b" />
          <path d="M55 53 Q57 49 63 49 L72 49 L72 54 L55 55 Z" fill="#1f242c" />
          <path d="M99 40 L110 37" stroke="var(--art-metal)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="108" cy="47" r="3.2" fill="#fff4d0" />
        </>
      )}
      {model === "popular_usado" && (
        <>
          <ellipse cx="81" cy="87" rx="56" ry="2.6" fill="var(--art-shadow)" />
          <path d="M30 60 Q30 56 34 56 L46 56 L54 43 Q55 41 58 41 L98 41 Q101 41 103 43 L114 56 L128 57 Q132 58 132 62 L132 74 Q132 77 129 77 L33 77 Q30 77 30 74 Z" fill="#a89e88" />
          <path d="M57 45 L76 45 L76 56 L50 56 Z" fill="var(--art-carglass)" />
          <path d="M80 45 L99 45 L109 56 L80 56 Z" fill="var(--art-carglass)" />
          <rect x="30" y="64" width="102" height="2" fill="#000" opacity=".14" />
          <rect x="125" y="59.5" width="7" height="3.5" rx="1" fill="#f4d58d" />
          <rect x="30" y="59.5" width="3.5" height="4" fill="#b42318" opacity=".85" />
          <Wheel x={51} />
          <Wheel x={112} />
        </>
      )}
      {model === "popular_novo" && (
        <>
          <ellipse cx="81" cy="87" rx="56" ry="2.6" fill="var(--art-shadow)" />
          <path d="M28 66 Q28 57 38 55 L50 53 Q58 42 70 40 L96 40 Q104 40 110 46 L118 54 Q130 56 133 62 L134 70 Q134 77 128 77 L34 77 Q28 77 28 70 Z" fill="#c0392b" />
          <path d="M56 52 Q62 44 70 44 L82 44 L82 53 Z" fill="var(--art-carglass)" />
          <path d="M86 44 L96 44 Q102 44 106 48 L111 53 L86 53 Z" fill="var(--art-carglass)" />
          <path d="M30 64 L132 64" stroke="#000" strokeOpacity=".16" strokeWidth="1.5" />
          <path d="M124 58 L132 60 L131 63 L123 62 Z" fill="#fff4d0" />
          <rect x="28" y="58" width="4" height="5" rx="1" fill="#7a1d12" />
          <Wheel x={50} r={9.5} />
          <Wheel x={112} r={9.5} />
        </>
      )}
      {model === "medio" && (
        <>
          <ellipse cx="81" cy="87" rx="60" ry="2.6" fill="var(--art-shadow)" />
          <rect x="58" y="31" width="44" height="3" rx="1.5" fill="#20262e" />
          <path d="M24 64 Q24 55 34 53 L46 51 L58 37 Q60 35 64 35 L104 35 Q110 35 114 40 L124 51 Q136 53 138 60 L138 72 Q138 78 132 78 L30 78 Q24 78 24 72 Z" fill="#33608f" />
          <path d="M50 50 L61 39 L80 39 L80 50 Z" fill="var(--art-carglass)" />
          <path d="M84 39 L103 39 Q107 39 110 43 L116 50 L84 50 Z" fill="var(--art-carglass)" />
          <path d="M26 62 L136 62" stroke="#000" strokeOpacity=".18" strokeWidth="1.5" />
          <path d="M130 55 L138 57 L137 61 L129 60 Z" fill="#fff4d0" />
          <rect x="24" y="56" width="4" height="6" rx="1" fill="#7a1d12" />
          <Wheel x={48} y={77} r={10.5} rim={5} />
          <Wheel x={116} y={77} r={10.5} rim={5} />
        </>
      )}
      {model === "luxo" && (
        <>
          <ellipse cx="81" cy="87.5" rx="66" ry="2.8" fill="var(--art-shadow)" />
          <path d="M18 62 Q18 52 28 50 L42 48 L52 33 Q54 30 58 30 L110 30 Q116 30 120 35 L130 48 Q142 50 144 58 L144 72 Q144 79 137 79 L25 79 Q18 79 18 72 Z" fill="#1d2129" />
          <path d="M46 47 L56 34 L82 34 L82 47 Z" fill="var(--art-carglass)" opacity=".9" />
          <path d="M86 34 L109 34 Q114 34 117 38 L124 47 L86 47 Z" fill="var(--art-carglass)" opacity=".9" />
          <path d="M20 60 L142 60" stroke="#c9cfd8" strokeWidth="1.3" />
          <path d="M134 52 L144 54 L143 58 L133 57 Z" fill="#e8f1ff" />
          <rect x="18" y="54" width="4" height="6" rx="1" fill="#b42318" />
          <Wheel x={46} y={77} r={12} rim={7} />
          <Wheel x={118} y={77} r={12} rim={7} />
        </>
      )}
    </Frame>
  );
}
