import { BG, HAIR_COLOR, parseAvatar, SKIN, TOP_COLOR } from "@/lib/avatar-code";

/**
 * Avatar desenhado (SVG) a partir do código do personagem. Quadrado: quem usa recorta em círculo
 * (os contêineres de avatar do jogo já são redondos).
 */
export function AvatarSvg({ code, title, className }: { code: string; title?: string; className?: string }) {
  const s = parseAvatar(code);
  if (!s) return null;
  const skin = SKIN[s.skin];
  const hair = HAIR_COLOR[s.hairColor];
  const top = TOP_COLOR[s.topColor];
  const light = s.topColor === 3;
  const shirt = light ? "#dfe6ef" : "#f4f1ea";
  return (
    <svg className={className} viewBox="0 0 64 64" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect width="64" height="64" fill={BG[s.bg]} />
      {/* cabelo de trás (longo, black power) */}
      {s.hair === 5 && <path d="M18.5 30 Q17 11 32 11 Q47 11 45.5 30 L47 47 Q41 45 39 40 L25 40 Q23 45 17 47 Z" fill={hair} />}
      {s.hair === 7 && <circle cx="32" cy="24" r="17" fill={hair} />}
      {/* roupa */}
      <path d="M8 64 Q10 47.5 32 45.5 Q54 47.5 56 64 Z" fill={top} />
      {/* pescoço */}
      <rect x="27" y="37" width="10" height="11" rx="3" fill={skin} />
      <rect x="27" y="40" width="10" height="3" fill="#000" opacity=".08" />
      {s.top === 0 && (
        <>
          <polygon points="26.5,46.5 32,57 37.5,46.5" fill={shirt} />
          <polygon points="31,48 33,48 34.4,57.5 32,60.5 29.6,57.5" fill={s.topColor === 4 ? "#1f2a44" : "#8a1c1c"} />
          <path d="M26.5 46.5 L30 58 M37.5 46.5 L34 58" stroke="#000" strokeOpacity=".25" strokeWidth=".8" />
        </>
      )}
      {s.top === 1 && (
        <>
          <polygon points="27,46.5 32,55 37,46.5" fill={shirt} />
          <path d="M27 46.5 L30.5 58 M37 46.5 L33.5 58" stroke="#000" strokeOpacity=".25" strokeWidth=".8" />
        </>
      )}
      {s.top === 2 && (
        <>
          <polygon points="26.5,46 31.5,50.5 29,52.5" fill="#000" opacity=".18" />
          <polygon points="37.5,46 32.5,50.5 35,52.5" fill="#000" opacity=".18" />
          {[53, 57, 61].map((y) => (
            <circle key={y} cx="32" cy={y} r=".7" fill="#000" opacity=".3" />
          ))}
        </>
      )}
      {s.top === 3 && <path d="M27 46 Q32 50 37 46" stroke={skin} strokeWidth="2.4" fill="none" />}
      {s.top === 4 && <rect x="26.5" y="41" width="11" height="8" rx="3" fill={top} />}
      {/* cabeça e orelhas */}
      <ellipse cx="20.6" cy="29" rx="2.3" ry="3.1" fill={skin} />
      <ellipse cx="43.4" cy="29" rx="2.3" ry="3.1" fill={skin} />
      <ellipse cx="32" cy="28" rx="11.6" ry="13" fill={skin} />
      {/* barba por fazer e barba cheia (antes da boca) */}
      {s.facial === 4 && <path d="M21 30 Q21.5 42 32 42.5 Q42.5 42 43 30 Q41 37.5 32 38.5 Q23 37.5 21 30 Z" fill={hair} opacity=".28" />}
      {s.facial === 1 && <path d="M20.6 29 Q20.8 44.5 32 45 Q43.2 44.5 43.4 29 Q41.5 38.5 32 39.2 Q22.5 38.5 20.6 29 Z" fill={hair} />}
      {/* cabelo da frente */}
      {s.hair === 0 && <path d="M20.4 27.5 Q19.8 14.2 32 14 Q44.2 14.2 43.6 27.5 Q41.5 19.8 32 19.6 Q22.5 19.8 20.4 27.5 Z" fill={hair} />}
      {s.hair === 1 && <path d="M20.6 26.5 Q20.4 15 32 14.8 Q43.6 15 43.4 26.5 Q41 20 32 19.9 Q23 20 20.6 26.5 Z" fill={hair} opacity=".55" />}
      {s.hair === 2 && (
        <>
          <path d="M20.5 31 Q19.8 23.5 22.8 20.4 L23.6 27.5 Z" fill={hair} />
          <path d="M43.5 31 Q44.2 23.5 41.2 20.4 L40.4 27.5 Z" fill={hair} />
        </>
      )}
      {s.hair === 3 && (
        <>
          <path d="M20.4 28 Q18.8 13.6 33 13.8 Q45 14.6 43.6 27.2 Q40.6 18.6 29.6 19.8 Q25.4 22.4 20.4 28 Z" fill={hair} />
          <path d="M29.6 14.6 Q28.6 17 29.4 19.8" stroke="#000" strokeOpacity=".25" strokeWidth=".7" fill="none" />
        </>
      )}
      {s.hair === 4 && (
        <g fill={hair}>
          <path d="M20.4 27.5 Q20 16 32 15.5 Q44 16 43.6 27.5 Q41.5 20.5 32 20.3 Q22.5 20.5 20.4 27.5 Z" />
          {[22, 26.5, 31, 35.5, 40].map((x, i) => (
            <circle key={x} cx={x + 1} cy={i % 2 ? 15.6 : 17.4} r="3.8" />
          ))}
          <circle cx="20.8" cy="22" r="3" />
          <circle cx="43.2" cy="22" r="3" />
        </g>
      )}
      {(s.hair === 5 || s.hair === 6) && <path d="M20.4 28 Q19.8 14 32 13.8 Q44.2 14 43.6 28 Q42 20.5 35 19.6 Q31 22.6 24.5 21.8 Q21.5 24 20.4 28 Z" fill={hair} />}
      {s.hair === 6 && <circle cx="32" cy="11.4" r="5.2" fill={hair} />}
      {s.hair === 7 && <path d="M20.6 27 Q21 18.5 32 18 Q43 18.5 43.4 27 Q41 22 32 21.8 Q23 22 20.6 27 Z" fill={hair} />}
      {/* sobrancelhas, olhos, nariz e boca */}
      <path d="M25 25.4 Q27.4 24.3 29.8 25.2 M34.2 25.2 Q36.6 24.3 39 25.4" stroke={s.hair === 2 && s.hairColor > 4 ? "#6b6b6b" : hair} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <ellipse cx="27.4" cy="29" rx="1.35" ry="1.5" fill="#1d1b1a" />
      <ellipse cx="36.6" cy="29" rx="1.35" ry="1.5" fill="#1d1b1a" />
      <path d="M32.2 30 Q31 33 32.8 33.6" stroke="#000" strokeOpacity=".22" strokeWidth="1" fill="none" strokeLinecap="round" />
      <path d="M28.6 36.2 Q32 38.6 35.4 36.2" stroke="#7a3b2e" strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {/* bigode e cavanhaque */}
      {(s.facial === 1 || s.facial === 2 || s.facial === 3) && <path d="M27.4 34.6 Q32 32.8 36.6 34.6 Q32 35.9 27.4 34.6 Z" fill={hair} />}
      {s.facial === 3 && <path d="M29 39.4 Q32 44 35 39.4 Q32 40.6 29 39.4 Z" fill={hair} />}
      {/* óculos */}
      {s.glasses === 1 && (
        <g stroke="#20242b" strokeWidth="1.1" fill="none">
          <circle cx="27.4" cy="29" r="3.6" />
          <circle cx="36.6" cy="29" r="3.6" />
          <path d="M31 28.6 Q32 27.9 33 28.6" />
        </g>
      )}
      {s.glasses === 2 && (
        <g stroke="#20242b" strokeWidth="1.2" fill="none">
          <rect x="23.4" y="26.2" width="8" height="5.8" rx="1.2" />
          <rect x="32.6" y="26.2" width="8" height="5.8" rx="1.2" />
          <path d="M31.4 28.4 L32.6 28.4" />
        </g>
      )}
    </svg>
  );
}
