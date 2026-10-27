import { CityMap } from "@/components/CityMap";
import { mapPayload } from "@/lib/city-view";
import { requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const state = await cachedState(me.worldId);
  const data = mapPayload(state, year, me.person.municipality || null);
  return (
    <>
      <div className="cm-head">
        <div>
          <h1>Mapa político</h1>
          <p className="muted">
            Os 5.570 municípios com prefeito e câmara. No ponto de partida, os dados são reais (TSE); depois, cada eleição municipal muda o mapa. Aproxime para ver
            as cidades.
          </p>
        </div>
      </div>
      <CityMap data={data} />
    </>
  );
}
