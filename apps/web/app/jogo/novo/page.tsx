import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AXES, AXIS_INFO, ORIGINS, PROFESSIONS, profileFor, UFS } from "@dp/engine";
import { CharacterForm } from "@/components/CharacterForm";
import { Icon } from "@/components/Icon";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { myCharacters } from "@/lib/game";
import { isStartYear, worldIdFor } from "@/lib/sim";
import { START_POINTS } from "@/lib/startpoints";

export const metadata: Metadata = { title: "Novo personagem" };

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;
const PROF_ICON: Record<string, string> = {
  professor: "book", advogado: "scale", medico: "shield", empresario: "briefcase", sindicalista: "megaphone", comunicador: "newspaper", policial: "shield",
  agricultor: "map", servidor: "landmark", pastor: "users", economista: "chart", estudante: "book", engenheiro: "sliders", autonomo: "bolt",
};
const ORIGIN_ICON: Record<string, string> = { periferia: "home", classe_media: "home", interior: "pin", elite: "star", rural: "map" };
const pct = (v: number) => v.toFixed(2).replace(".", ",");

export default async function Page({ searchParams }: { searchParams: Promise<{ ano?: string }> }) {
  const year = Number((await searchParams).ano ?? 2026);
  if (!isStartYear(year)) redirect("/jogo");
  const chars = await myCharacters();
  if (chars.some((c) => c.world_id === worldIdFor(year))) redirect(`/jogo/${year}`);
  const sp = START_POINTS.find((s) => s.year === year)!;
  const wc = profileFor(sp.winnerParty, year).color;
  const rc = profileFor(sp.rivalParty, year).color;
  return (
    <>
      <AppHeader />
      <PageHero kicker={`Mundo pós-${year} · começa em ${sp.date.split("-").reverse().join("/")}`} title="Novo personagem" lede="Você ainda não participa formalmente da política. Defina quem você é; o resto se conquista jogando." />
      <main className="container page-body">
        <div className="cf-layout">
          <CharacterForm
            year={year}
            ufs={UFS.map((u) => ({ value: u.code, label: u.name, hint: `Capital: ${u.capital}` }))}
            professions={PROFESSIONS.map((p) => ({ value: p.id, label: cap(p.label), hint: `${brl(p.income)}/mês`, icon: PROF_ICON[p.id] }))}
            origins={ORIGINS.map((o) => ({ value: o.id, label: cap(o.label), hint: `Economias: ${brl(o.savings)}`, icon: ORIGIN_ICON[o.id] }))}
            axes={AXES.map((a) => ({ key: a, label: AXIS_INFO[a].label, neg: AXIS_INFO[a].neg, pos: AXIS_INFO[a].pos }))}
          />
          <aside className="cf-aside">
            <div className="cf-world">
              <div className="label">O país em que você chega</div>
              <div className="cf-world__year">{year}</div>
              <div className="cf-world__duel">
                <div>
                  <b>{sp.winner}</b>
                  <span>{sp.winnerParty} · eleito(a)</span>
                </div>
                <span className="mono">{pct(sp.winnerShare)}%</span>
              </div>
              <div className="track-bar">
                <span style={{ width: `${sp.winnerShare}%`, background: wc }} />
                <span style={{ width: `${sp.rivalShare}%`, background: rc, opacity: 0.6 }} />
              </div>
              <div className="cf-world__duel muted">
                <div>
                  <b>{sp.rival}</b>
                  <span>{sp.rivalParty}</span>
                </div>
                <span className="mono">{pct(sp.rivalShare)}%</span>
              </div>
              <dl className="cf-world__facts">
                <div><dt>Em exercício</dt><dd>{sp.incumbent}</dd></div>
                <div><dt>Eleitorado</dt><dd>{(sp.electorate / 1e6).toFixed(1).replace(".", ",")} mi</dd></div>
                <div><dt>Selic</dt><dd>{sp.selic != null ? `${String(sp.selic).replace(".", ",")}%` : "—"}</dd></div>
                <div><dt>IPCA 12m</dt><dd>{sp.ipca != null ? `${String(sp.ipca).replace(".", ",")}%` : "—"}</dd></div>
              </dl>
              <p className="cf-world__note">
                <Icon name="info" size={15} /> Resultado oficial do TSE. A partir desta data, tudo é simulação.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
