import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Domínio Político",
    short_name: "Domínio",
    description: "Simulador persistente de carreira política brasileira.",
    start_url: "/jogo",
    display: "standalone",
    background_color: "#0b1f3a",
    theme_color: "#0b1f3a",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
