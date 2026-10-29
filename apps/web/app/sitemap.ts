import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";
import { START_POINTS } from "@/lib/startpoints";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/como-funciona", "/manual", "/glossario", "/fontes", "/privacidade", "/termos", ...START_POINTS.map((s) => `/partida/${s.year}`)].map((p) => ({
    url: `${SITE_URL}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.6,
  }));
}
