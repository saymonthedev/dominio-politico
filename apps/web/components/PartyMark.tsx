import { logoOf } from "@/lib/logos";

/** Marca do partido: o logo oficial (Wikimedia Commons) num quadro claro, ou a sigla na cor do partido. */
export function PartyMark({ party, year, size = 52 }: { party: { acronym: string; color: string } | null | undefined; year?: number; size?: number }) {
  if (!party) return <span className="pmark" style={{ width: size, height: size }}>?</span>;
  const logo = logoOf(party.acronym, year);
  if (!logo) {
    return (
      <span className="pmark" style={{ width: size, height: size, background: party.color, fontSize: size < 60 ? ".74rem" : "1rem" }}>
        {party.acronym}
      </span>
    );
  }
  return (
    <span className="pmark pmark--logo" style={{ width: size, height: size, ["--c" as string]: party.color }}>
      <img src={logo.src} alt={`Logo do ${party.acronym}`} width={logo.w} height={logo.h} loading="lazy" decoding="async" />
    </span>
  );
}
