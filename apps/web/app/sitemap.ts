import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { START_POINTS } from "@/lib/startpoints";

/** Data da publicação: as páginas públicas são estáticas e só mudam quando o site é publicado de novo. */
const BUILT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/como-funciona", "/manual", "/glossario", "/fontes", "/cadastro", "/privacidade", "/termos", ...START_POINTS.map((s) => `/partida/${s.year}`)].map((p) => ({
    url: `${SITE_URL}${p}`,
    lastModified: BUILT,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : p.startsWith("/partida") ? 0.8 : 0.6,
  }));
}
