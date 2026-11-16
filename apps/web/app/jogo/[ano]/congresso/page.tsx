import { UF_BY_CODE, type MandateRow, type PersonRow } from "@dp/engine";
import { Empty, GameHeader, Panel, Pill } from "@/components/game/Page";
import { NavSelect } from "@/components/NavSelect";
import { PersonAvatar } from "@/components/PersonAvatar";
import { avatarOf } from "@/lib/avatar";
import { fmtDate, fmtNum } from "@/lib/format";
import { playerState, requireMe } from "@/lib/game";
import { photoOf } from "@/lib/photos";

type House = "camara" | "senado";

const HOUSE = {
  camara: { office: "DEP_FEDERAL", title: "Câmara dos Deputados", seats: 513, one: "deputado(a)", many: "deputados(as)" },
  senado: { office: "SENADOR", title: "Senado Federal", seats: 81, one: "senador(a)", many: "senadores(as)" },
} as const;

/**
 * Congresso Nacional (sugestão do jogador Gabriel do Valle): todos os deputados federais e senadores
 * do mundo, com as bancadas de cada partido e filtros por estado e partido.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ ano: string }>; searchParams: Promise<{ casa?: string; uf?: string; partido?: string }> }) {
  const year = Number((await params).ano);
  const q = await searchParams;
  const me = await requireMe(year);
  const state = await playerState(year);
  const house: House = q.casa === "senado" ? "senado" : "camara";
  const h = HOUSE[house];
  const uf = q.uf && UF_BY_CODE[q.uf] ? q.uf : "";
  const partyId = q.partido && state.t.parties.has(q.partido) ? q.partido : "";

  // quem ocupa as cadeiras: os mandatos em exercício e, enquanto a legislatura eleita não toma
  // posse (logo depois da eleição), os eleitos completam as cadeiras com a data da posse
  type Seat = { p: PersonRow; m: MandateRow; future: boolean };
  const seated = (k: House): Seat[] => {
    const office = HOUSE[k].office;
    const ms = [...state.t.mandates.values()].filter((m) => m.office_code === office);
    const out: Seat[] = [];
    const have = new Set<string>();
    const take = (m: MandateRow, future: boolean) => {
      const p = state.t.persons.get(m.person_id);
      if (!p || p.status !== "ACTIVE" || have.has(p.id)) return;
      have.add(p.id);
      out.push({ p, m, future });
    };
    for (const m of ms) if (m.status === "ATIVO") take(m, false);
    for (const m of ms.filter((x) => x.status === "FUTURO").sort((a, b) => a.start_on.localeCompare(b.start_on))) {
      if (out.length >= HOUSE[k].seats) break;
      take(m, true);
    }
    return out;
  };
  const all = seated(house);
  const counts = { camara: house === "camara" ? all.length : seated("camara").length, senado: house === "senado" ? all.length : seated("senado").length };
  const inUf = all.filter((x) => !uf || x.m.geo === uf);
  const list = inUf
    .filter((x) => !partyId || x.p.party_id === partyId)
    .sort((a, b) => a.m.geo.localeCompare(b.m.geo) || a.p.name.localeCompare(b.p.name, "pt-BR"));

  // bancadas (no estado escolhido, se houver): cada partido com quantas cadeiras tem
  const bench = new Map<string, number>();
  for (const { p } of inUf) bench.set(p.party_id ?? "", (bench.get(p.party_id ?? "") ?? 0) + 1);
  const benches = [...bench.entries()].sort((a, b) => b[1] - a[1]);
  const elected = all.filter((x) => x.future);

  const href = (o: { casa?: House; uf?: string; partido?: string }) => {
    const s = new URLSearchParams();
    const casa = o.casa ?? house;
    if (casa === "senado") s.set("casa", "senado");
    const u = o.uf ?? uf;
    if (u) s.set("uf", u);
    const pa = o.partido ?? partyId;
    if (pa) s.set("partido", pa);
    const qs = s.toString();
    return qs ? `?${qs}` : `/jogo/${year}/congresso`;
  };
  const ufOptions = [{ value: "", label: "Todos os estados" }, ...Object.values(UF_BY_CODE).map((u) => ({ value: u.code, label: u.name }))];
  const partyIds = [...new Set(all.map((x) => x.p.party_id).filter((x): x is string => !!x))];
  const partyOptions = [
    { value: "", label: "Todos os partidos" },
    ...partyIds.map((id) => state.t.parties.get(id)).filter((p) => !!p).sort((a, b) => a!.acronym.localeCompare(b!.acronym)).map((p) => ({ value: p!.id, label: `${p!.acronym} · ${p!.name}` })),
  ];

  return (
    <>
      <GameHeader kicker="O país" icon="landmark" title="Congresso Nacional" lede="Quem ocupa as cadeiras da Câmara e do Senado neste mundo, com o tamanho da bancada de cada partido." />

      <nav className="cong-tabs" aria-label="Casas do Congresso">
        {(["camara", "senado"] as const).map((k) => (
          <a key={k} href={href({ casa: k, partido: "" })} className={`ui-btn ui-btn--sm ${k === house ? "ui-btn--gold" : "ui-btn--ghost"}`} aria-current={k === house ? "page" : undefined}>
            {HOUSE[k].title} <span className="mono">({fmtNum(counts[k])})</span>
          </a>
        ))}
      </nav>

      <div className="efilter cong-filter">
        <NavSelect label="Estado" value={uf} options={ufOptions} hrefFor={Object.fromEntries(ufOptions.map((o) => [o.value, href({ uf: o.value })]))} />
        <NavSelect label="Partido" value={partyId} options={partyOptions} hrefFor={Object.fromEntries(partyOptions.map((o) => [o.value, href({ partido: o.value })]))} />
      </div>

      <Panel title={`Bancadas${uf ? ` de ${UF_BY_CODE[uf].name}` : ""}`} icon="chart" aside={<span className="muted small">{fmtNum(inUf.length)} de {fmtNum(uf ? inUf.length : h.seats)} cadeiras · toque para filtrar</span>}>
        {benches.length ? (
          <ul className="cong-bench">
            {benches.map(([id, n]) => {
              const party = state.t.parties.get(id);
              const on = id === partyId;
              return (
                <li key={id || "sem"}>
                  <a href={href({ partido: on ? "" : id })} className={on ? "is-on" : undefined} style={{ ["--c" as string]: party?.color ?? "#64748b" }} aria-pressed={on}>
                    <i aria-hidden="true" />
                    <b>{party?.acronym ?? "sem partido"}</b>
                    <span className="mono">{n}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted small">Ninguém nesta casa ainda.</p>
        )}
      </Panel>

      <Panel title={h.title} icon="users" aside={<span className="muted small">{fmtNum(list.length)} {list.length === 1 ? h.one : h.many}</span>}>
        {elected.length > 0 && (
          <p className="muted small" style={{ marginTop: 0 }}>
            {elected.length} {elected.length === 1 ? "cadeira é" : "cadeiras são"} de quem já foi eleito(a) e toma posse em {fmtDate(elected[0].m.start_on)}.
          </p>
        )}
        {list.length ? (
          <div className="people">
            {list.map(({ p, m, future }) => {
              const party = p.party_id ? state.t.parties.get(p.party_id) : undefined;
              return (
                <a key={p.id} className="person" href={`/jogo/${year}/pessoa/${p.id}`}>
                  <PersonAvatar name={p.name} color={party?.color} photo={photoOf(p)} avatar={avatarOf(state, p)} size={40} />
                  <div>
                    <b>{p.name}</b>
                    <span>
                      {party?.acronym ?? "sem partido"} · {UF_BY_CODE[m.geo]?.name ?? m.geo} · {future ? `posse em ${fmtDate(m.start_on)}` : `até ${m.end_on.slice(0, 4)}`}
                    </span>
                    {p.kind === "PLAYER" && <Pill tone="gold">{p.id === me.person.id ? "você" : "jogador(a)"}</Pill>}
                  </div>
                </a>
              );
            })}
          </div>
        ) : (
          <Empty icon="users" title="Ninguém com esse filtro">
            Troque o estado ou o partido.
          </Empty>
        )}
      </Panel>
    </>
  );
}
