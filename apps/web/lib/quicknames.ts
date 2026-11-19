import { namesIn, quickNames, realNameSet, Rng } from "@dp/engine";
import { loadCities, loadSnapshot } from "@dp/data";

/**
 * Nomes do "Criar rápido" (19/11): sorteados a cada visita, sem nenhum que contenha o nome de uma
 * pessoa real do ponto de partida. A lista de nomes reais sai dos arquivos de dados (uma vez por
 * instância e ano); a criação do personagem confere de novo, como sempre.
 */
const realByYear = new Map<number, Promise<Set<string>>>();

function realNames(year: number): Promise<Set<string>> {
  let p = realByYear.get(year);
  if (!p) {
    p = Promise.all([loadSnapshot(year), loadCities(year)]).then(([snap, cities]) => realNameSet([...namesIn(snap), ...namesIn(cities)]));
    p.catch(() => realByYear.delete(year));
    realByYear.set(year, p);
  }
  return p;
}

export async function suggestNames(year: number): Promise<{ F: string[]; M: string[] }> {
  try {
    return quickNames(new Rng(crypto.randomUUID()), await realNames(year), 8);
  } catch {
    // sem os dados: o Criar rápido some e fica o formulário completo
    return { F: [], M: [] };
  }
}
