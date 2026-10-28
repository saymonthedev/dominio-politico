import { CityMap } from "@/components/CityMap";
import { GameHeader } from "@/components/game/Page";
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
      <GameHeader
        kicker="O país"
        icon="map"
        title="Mapa político"
        lede="Os 5.570 municípios com prefeito(a) e câmara. No ponto de partida os dados são reais (TSE); depois, cada eleição municipal redesenha o mapa. Aproxime para ver as cidades e clique para detalhes."
      />
      <CityMap data={data} />
    </>
  );
}
