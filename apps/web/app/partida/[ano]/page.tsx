import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { profileFor, UF_BY_CODE } from "@dp/engine";
import { Icon } from "@/components/Icon";
import { Footer, PageHero, PublicHeader } from "@/components/SiteChrome";
import { currentUser } from "@/lib/supabase/server";
import { START_POINTS } from "@/lib/startpoints";

const pct = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;
const date = (iso: string) => iso.split("-").reverse().join("/");
const pointOf = (ano: string) => START_POINTS.find((s) => String(s.year) === ano);

export function generateStaticParams() {
  return START_POINTS.map((s) => ({ ano: String(s.year) }));
}

export async function generateMetadata({ params }: { params: Promise<{ ano: string }> }): Promise<Metadata> {
  const sp = pointOf((await params).ano);
  if (!sp) return {};
  const description = `Comece no Brasil de ${date(sp.date)}, dia seguinte ao 2º turno em que ${sp.winner} (${sp.winnerParty}) venceu ${sp.rival} (${sp.rivalParty}) com ${pct(sp.winnerShare)} dos votos válidos. Os partidos, os eleitos e a economia daquele momento; daí em diante, a história é sua.`;
  return { title: `Ponto de partida ${sp.year}`, description, alternates: { canonical: `/partida/${sp.year}` }, openGraph: { title: `Brasil pós-${sp.year} · Domínio Político`, description } };
}

/** Regras que valem na primeira eleição geral do mundo (quatro anos depois do ponto de partida). */
function rulesFor(start: number): string[] {
  const y = start + 4;
  return [
    `Filiação partidária ${y <= 2014 ? "12" : "6"} meses antes da eleição e domicílio eleitoral de ${y <= 2016 ? "12" : "6"} meses`,
    y >= 2012 ? "Lei da Ficha Limpa em vigor" : "Antes da Lei da Ficha Limpa",
    y <= 2014 ? "Empresas ainda podem doar para campanhas" : "Doação de empresas proibida",
    y >= 2018 ? "Fundo Especial de Financiamento de Campanha (FEFC)" : "Sem fundo eleitoral público",
    y <= 2018 ? "Coligações nas eleições proporcionais" : "Sem coligações proporcionais; federações a partir de 2022",
    y >= 2016 ? "Janela partidária para trocar de partido sem perder o mandato" : "Sem janela partidária",
  ];
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const sp = pointOf((await params).ano);
  if (!sp) notFound();
  const { user } = await currentUser();
  const start = user ? `/jogo/novo?ano=${sp.year}` : `/cadastro?ano=${sp.year}`;
  const wc = profileFor(sp.winnerParty, sp.year).color;
  const rc = profileFor(sp.rivalParty, sp.year).color;
  const ufs = Object.entries(sp.ufResults).sort(([a], [b]) => (UF_BY_CODE[a]?.name ?? a).localeCompare(UF_BY_CODE[b]?.name ?? b, "pt-BR"));
  const won = ufs.filter(([, r]) => r.name === sp.winner).length;

  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <PageHero
        kicker={`Ponto de partida · ${date(sp.date)}`}
        title={`Brasil pós-${sp.year}`}
        lede={`O mundo começa no dia seguinte ao 2º turno. ${sp.winner} (${sp.winnerParty}) venceu ${sp.rival} (${sp.rivalParty}) e ${sp.incumbent === sp.winner ? "foi reeleito(a)" : `vai suceder ${sp.incumbent}`}. Você chega como cidadão comum, sem partido e sem mandato.`}
      >
        <div className="cta sp-cta">
          <a className="btn gold" href={start}>
            Começar em {sp.year} <Icon name="arrow" size={18} />
          </a>
          <a className="btn on-dark" href="/como-funciona">
            Como funciona
          </a>
        </div>
      </PageHero>

      <main className="container page-body startpage">
        <section className="sp-card">
          <h2>O 2º turno de {sp.year}</h2>
          <div className="sp-duel">
            <div>
              <b>{sp.winner}</b>
              <span>
                {sp.winnerParty} · eleito(a) · {won} de 27 estados
              </span>
            </div>
            <span className="mono">{pct(sp.winnerShare)}</span>
          </div>
          <div className="track-bar">
            <span style={{ width: `${sp.winnerShare}%`, background: wc }} />
            <span style={{ width: `${sp.rivalShare}%`, background: rc, opacity: 0.6 }} />
          </div>
          <div className="sp-duel muted">
            <div>
              <b>{sp.rival}</b>
              <span>{sp.rivalParty}</span>
            </div>
            <span className="mono">{pct(sp.rivalShare)}</span>
          </div>
          <p className="muted small">Resultado oficial do TSE, em votos válidos.</p>
        </section>

        <section className="sp-stats">
          <div>
            <b className="mono">{(sp.electorate / 1e6).toFixed(1).replace(".", ",")} mi</b>
            <span>eleitores</span>
          </div>
          <div>
            <b className="mono">{sp.parties}</b>
            <span>partidos registrados</span>
          </div>
          <div>
            <b className="mono">{pct(sp.selic)}</b>
            <span>Selic</span>
          </div>
          <div>
            <b className="mono">{pct(sp.ipca)}</b>
            <span>inflação em 12 meses</span>
          </div>
        </section>

        <section className="sp-card">
          <h2>Quem venceu em cada estado</h2>
          <ul className="sp-ufs">
            {ufs.map(([uf, r]) => (
              <li key={uf} style={{ ["--c" as string]: r.name === sp.winner ? wc : rc }}>
                <span className="mono">{uf}</span>
                <span>{r.name}</span>
                <b className="mono">{r.share.toFixed(1).replace(".", ",")}%</b>
              </li>
            ))}
          </ul>
        </section>

        <section className="sp-card">
          <h2>Regras da primeira eleição geral ({sp.year + 4})</h2>
          <ul className="checks">
            {rulesFor(sp.year).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="muted small">
            Antes dela, em {sp.year + 2}, já há eleições municipais. Depois do ponto de partida, tudo é simulação: os resultados reais só valem para o dia em que o
            jogo começa.
          </p>
        </section>

        <nav className="sp-years" aria-label="Outros pontos de partida">
          {START_POINTS.map((s) =>
            s.year === sp.year ? (
              <span key={s.year} className="is-on" aria-current="page">
                {s.year}
              </span>
            ) : (
              <a key={s.year} href={`/partida/${s.year}`}>
                {s.year}
              </a>
            ),
          )}
        </nav>
      </main>
      <Footer />
    </>
  );
}
