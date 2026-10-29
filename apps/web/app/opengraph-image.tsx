import { ogImage, OG_SIZE } from "@/lib/og";

export const alt = "Domínio Político: simulador de carreira política brasileira";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({
    kicker: "Simulador político · Brasil real",
    title: "Do bairro ao Planalto.",
    accent: "Ou ao escândalo.",
    lede: "Comece como cidadão no Brasil do dia seguinte a uma eleição presidencial real, de 2002 a 2026, e construa sua carreira até a Presidência.",
  });
}
