import { ContentPage } from "@/components/ContentPage";
import { GLOSSARY } from "@/lib/glossary";

export const metadata = { title: "Glossário" };

export default function Page() {
  return (
    <ContentPage kicker="Referência" title="Glossário" lede="Os termos de política, eleição, dinheiro e justiça que aparecem no jogo. Nas telas do jogo, passe o mouse ou toque nas palavras sublinhadas com pontos.">
      <div className="glossary">
        {GLOSSARY.map((e) => (
          <div key={e.term} className="card flat" id={e.term.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, "-")}>
            <h3>{e.term}</h3>
            <p className="muted" style={{ margin: 0 }}>{e.text}</p>
          </div>
        ))}
      </div>
    </ContentPage>
  );
}
