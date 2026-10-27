"use client";
import { usePathname } from "next/navigation";

const ITEMS: Array<[string, string]> = [
  ["", "Painel"],
  ["/noticias", "Notícias"],
  ["/carreira", "Minha carreira"],
  ["/partidos", "Partidos"],
  ["/eleicoes", "Eleições"],
  ["/campanha", "Campanha"],
  ["/governo", "Governo"],
  ["/investigacoes", "Investigações"],
  ["/mapa", "Mapa"],
  ["/economia", "Economia"],
  ["/relacoes", "Relações"],
];

export function GameNav({ year }: { year: number }) {
  const path = usePathname();
  const base = `/jogo/${year}`;
  return (
    <nav className="gamenav" aria-label="Seções do jogo">
      <div className="container inner">
        {ITEMS.map(([suffix, label]) => {
          const href = base + suffix;
          const active = suffix === "" ? path === base : path.startsWith(href);
          return (
            <a key={href} href={href} className={active ? "active" : ""}>
              {label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
