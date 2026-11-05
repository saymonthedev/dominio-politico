import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  return {
    // fotos de políticos, logos de partidos e mapas só servem dentro do jogo: fora do índice, para
    // buscadores e assistentes (ChatGPT, Google) não usarem essas imagens como a cara do site
    rules: [{ userAgent: "*", allow: "/", disallow: ["/jogo", "/conta", "/api", "/auth", "/fotos/", "/logos/", "/geo/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
