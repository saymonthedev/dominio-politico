import manifest from "./photos.json";

const PHOTOS = manifest as Record<string, number>;

export interface Photo {
  src: string;
  /** ano da eleição em que a foto foi registrada no TSE */
  year: number;
}

/** Foto oficial de candidatura (TSE, CC-BY) de uma pessoa real, quando houver. */
export function photoOf(p: { kind: string; external_ref: string | null } | null | undefined): Photo | null {
  if (!p?.external_ref || (p.kind !== "REAL_ACTIVE_AT_SNAPSHOT" && p.kind !== "REAL_HISTORICAL")) return null;
  const year = PHOTOS[p.external_ref];
  return year ? { src: `/fotos/${p.external_ref}.webp`, year } : null;
}
