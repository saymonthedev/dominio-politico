import { initials } from "@/lib/format";
import type { Photo } from "@/lib/photos";

/** Foto real (TSE) quando houver; senão, iniciais na cor do partido. */
export function PersonAvatar({ name, color, photo, size = 40 }: { name: string; color?: string | null; photo?: Photo | null; size?: number }) {
  const style = { width: size, height: size * (photo ? 1.25 : 1), ["--c" as string]: color ?? "var(--planalto-2)", fontSize: size * 0.36 };
  return photo ? (
    <span className="pavatar has-photo" style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.src} alt={`Foto de ${name}`} loading="lazy" width={size} height={size * 1.25} />
    </span>
  ) : (
    <span className="pavatar" style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function PhotoCredit({ photo }: { photo: Photo }) {
  return <span className="photo-credit">Foto: TSE, candidatura de {photo.year} (CC-BY)</span>;
}
