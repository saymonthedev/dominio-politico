import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { careerEndSummary } from "@/app/jogo/actions";
import { CareerEndModal } from "@/components/game/CareerEnd";
import { getSession } from "@/lib/game";
import { isStartYear } from "@/lib/sim";

export const metadata: Metadata = { title: "Fim da jornada" };
export const dynamic = "force-dynamic";

/** Balanço de uma carreira encerrada (morte ou aposentadoria) neste mundo. */
export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ p?: string }> }) {
  const year = Number((await params).ano);
  if (!isStartYear(year)) redirect("/jogo");
  const { user } = await getSession();
  if (!user) redirect(`/entrar?next=/jogo/fim/${year}`);
  const summary = await careerEndSummary(year, (await searchParams).p);
  // sem carreira encerrada aqui: criar personagem (nunca volta para o jogo, que mandaria de novo para cá)
  if (!summary) redirect(`/jogo/novo?ano=${year}`);
  return (
    <main className="obit-page">
      <CareerEndModal summary={summary} year={year} standalone />
    </main>
  );
}
