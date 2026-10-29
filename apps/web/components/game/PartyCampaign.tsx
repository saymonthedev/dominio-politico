import { geoName, OFFICES, type CandidacyRow, type CityBase, type ElectionRow, type PartyRow, type PersonRow } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, MeterRow, Panel, Pill } from "@/components/game/Page";
import { PersonAvatar } from "@/components/PersonAvatar";
import { Term } from "@/components/Term";
import type { ActionView } from "@/lib/actions-view";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { photoOf } from "@/lib/photos";

const CAND_STATUS: Record<CandidacyRow["status"], { label: string; tone?: "ok" | "bad" | "warn" | "sim" | "gold" }> = {
  PRE: { label: "aguarda a convenção", tone: "warn" },
  HOMOLOGADA: { label: "homologada", tone: "ok" },
  INDEFERIDA: { label: "indeferida", tone: "bad" },
  DESISTENTE: { label: "retirada" },
  ELEITO: { label: "eleito(a)", tone: "gold" },
  NAO_ELEITO: { label: "não eleito(a)" },
  SEGUNDO_TURNO: { label: "no 2º turno", tone: "warn" },
  SUPLENTE: { label: "suplente", tone: "sim" },
};

/** Chapa da legenda e o fundo eleitoral: quem a presidência lançou e quanto cada campanha recebeu. */
export function PartyCampaign({
  year,
  election,
  party,
  cands,
  people,
  cities,
  today,
  actions,
}: {
  year: number;
  election: ElectionRow;
  party: PartyRow;
  cands: CandidacyRow[];
  people: Map<string, PersonRow>;
  cities?: Map<string, CityBase>;
  today: string;
  actions: ActionView[];
}) {
  const fund = party.campaign_fund?.election_id === election.id ? party.campaign_fund : null;
  const cal = election.calendar;
  const phase =
    election.status === "AGENDADA"
      ? `As indicações abrem em ${fmtDate(cal.preCampaignStart)}, no começo do ano eleitoral.`
      : today < cal.conventionEnd
        ? `Indique nomes até o fim das convenções, em ${fmtDate(cal.conventionEnd)}. A convenção só confere quem pode concorrer.`
        : today < election.first_round
          ? `Campanha até o 1º turno, em ${fmtDate(election.first_round)}. Reparta o fundo antes disso.`
          : "A votação já aconteceu.";
  const order = (c: CandidacyRow) => ["ELEITO", "SEGUNDO_TURNO", "HOMOLOGADA", "PRE", "SUPLENTE", "NAO_ELEITO", "INDEFERIDA", "DESISTENTE"].indexOf(c.status);
  return (
    <Panel title={`Eleições de ${election.year}: candidaturas`} icon="ballot" aside={<span className="muted small">{election.kind === "GERAL" ? "gerais" : "municipais"}</span>}>
      <p className="small" style={{ marginTop: 0 }}>
        No partido que você preside, a chapa é decisão sua: indique membros e, depois das convenções, reparta a cota do partido no{" "}
        <Term k="FEFC">fundo eleitoral</Term>. {phase}
      </p>
      {fund && (
        <div className="fundbox">
          <div className="fundbox__nums">
            <span>
              <small>Cota do partido</small>
              <b className="mono">{fmtMoney(fund.total)}</b>
            </span>
            <span>
              <small>Repassado</small>
              <b className="mono">{fmtMoney(fund.total - fund.left)}</b>
            </span>
            <span>
              <small>{today >= election.first_round ? "Devolvido ao Tesouro" : "Ainda no caixa da campanha"}</small>
              <b className="mono">{fmtMoney(today >= election.first_round ? fund.total - Object.values(fund.given).reduce((a, b) => a + b, 0) : fund.left)}</b>
            </span>
          </div>
          <MeterRow label="Repassado às candidaturas" value={fund.total ? ((fund.total - fund.left) / fund.total) * 100 : 0} unit="%" tone="gold" />
        </div>
      )}
      {cands.length ? (
        <ul className="pcands">
          {[...cands].sort((a, b) => order(a) - order(b)).map((c) => {
            const who = people.get(c.person_id);
            const st = CAND_STATUS[c.status];
            const given = fund?.given[c.id] ?? 0;
            return (
              <li key={c.id}>
                <PersonAvatar name={who?.name ?? "?"} color={party.color} photo={who ? photoOf(who) : null} size={34} />
                <div>
                  <b>{who ? <a href={`/jogo/${year}/pessoa/${who.id}`}>{who.name}</a> : "Candidatura"}</b>
                  <span>
                    {OFFICES[c.office_code].name} · {geoName(c.geo, { cities })}
                    {c.votes ? ` · ${fmtNum(c.votes)} votos` : ""}
                    {given ? ` · fundo: ${fmtMoney(given)}` : c.campaign.fefc ? ` · fundo: ${fmtMoney(c.campaign.fefc)}` : ""}
                  </span>
                  {c.note && c.status !== "HOMOLOGADA" && <span className="muted">{c.note}</span>}
                </div>
                <Pill tone={st.tone}>{st.label}</Pill>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty icon="ballot" title="Nenhuma candidatura ainda">
          {election.status === "AGENDADA" ? "Quando o ano eleitoral começar, indique membros do partido para as disputas." : "Indique membros do partido; sem indicação, a legenda fica fora da disputa."}
        </Empty>
      )}
      {actions.length > 0 && (
        <div className="mt">
          <ActionPanel year={year} actions={actions} />
        </div>
      )}
    </Panel>
  );
}

