import { Ctx, monthlyStatement, priceLevel, type FinanceRow, type LedgerItem } from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { Empty, GameHeader, Kpi, Panel, Pill } from "@/components/game/Page";
import { Icon } from "@/components/Icon";
import { Sparkline } from "@/components/ui";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getSession, requireMe } from "@/lib/game";
import { cachedState } from "@/lib/sim";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthLabel = (m: string | null) => (m ? `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}` : "");

const KIND_LABEL: Record<string, string> = {
  RENDA: "Renda",
  SUBSIDIO: "Subsídio",
  IMPOSTO: "Imposto",
  RENDIMENTO: "Rendimento",
  CUSTO_VIDA: "Custo de vida",
  CONTRIBUICAO_PARTIDO: "Partido",
  JUROS: "Juros",
  EMPRESTIMO: "Empréstimo",
  AMORTIZACAO: "Dívida paga",
  DESPESA: "Despesa",
  DOACAO: "Doação",
  FEFC: "Fundo eleitoral",
  FUNDACAO_PARTIDO: "Fundação",
  COLETA_ASSINATURAS: "Coleta",
  LAVAGEM: "Lavagem",
  NAO_DECLARADO: "Por fora",
  RECURSO_PROPRIO: "Recurso próprio",
  MULTA: "Multa",
};

function LedgerRows({ items }: { items: LedgerItem[] }) {
  return (
    <ul className="ledger">
      {items.map((i, n) => (
        <li key={n} className={i.amount >= 0 ? "in" : "out"}>
          <span>{i.label}</span>
          <b className="mono">
            {i.amount >= 0 ? "+" : "−"} {fmtMoney(Math.abs(i.amount))}
          </b>
        </li>
      ))}
    </ul>
  );
}

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const { sb } = await getSession();
  const [state, txQ] = await Promise.all([
    cachedState(me.worldId),
    sb.from("finance_transactions").select("*").eq("world_id", me.worldId).eq("person_id", me.person.id).order("game_date", { ascending: false }).limit(240),
  ]);
  const person = state.t.persons.get(me.person.id) ?? me.person;
  const st = state.t.person_states.get(me.person.id) ?? me.state;
  const txs = (txQ.data ?? []) as FinanceRow[];
  const preview = monthlyStatement(new Ctx(state, "view"), person, st);
  const ledger = st.ledger ?? { month: null, items: [], net: 0 };
  const worth = st.money + st.assets - st.debt;
  // saldo do mês (entradas − saídas declaradas) para o gráfico
  const byMonth = new Map<string, number>();
  for (const t of txs) byMonth.set(t.game_date.slice(0, 7), (byMonth.get(t.game_date.slice(0, 7)) ?? 0) + t.amount);
  const months = [...byMonth.keys()].sort().slice(-12);
  const series = months.map((m) => byMonth.get(m) ?? 0);
  const actions = actionsFor(state, me.person.id, ["FINANCAS"]);
  const pl = priceLevel(state.world.game_date);

  return (
    <>
      <GameHeader
        kicker="Você"
        icon="coins"
        title="Finanças"
        lede="O que entra e sai todo mês, o que você tem e o que deve. O fechamento acontece no dia 1. Valores de referência aproximados, corrigidos pela inflação da época."
      />

      <div className="kpis mb">
        <Kpi icon="coins" label="Saldo em conta" value={fmtMoney(st.money)} hint={`rende com a Selic (${(state.economy?.selic ?? 0).toFixed(2).replace(".", ",")}%)`} />
        <Kpi icon="landmark" label="Patrimônio líquido" value={fmtMoney(worth)} hint={`bens declarados: ${fmtMoney(st.assets)}`} tone={worth < 0 ? "down" : undefined} />
        <Kpi icon="alert" label="Dívida" value={fmtMoney(st.debt)} hint={st.debt > 0 ? "juros de Selic + 2,5% ao mês" : "nenhuma"} tone={st.debt > 0 ? "warn" : undefined} />
        <Kpi icon="trending" label="Resultado do último mês" value={`${ledger.net >= 0 ? "+" : "−"} ${fmtMoney(Math.abs(ledger.net))}`} hint={ledger.month ? monthLabel(ledger.month) : "ainda sem fechamento"} tone={ledger.net >= 0 ? "up" : "down"} />
      </div>

      {st.dirty_money > 0 && (
        <div className="hint-band hint-band--danger">
          <Icon name="alert" size={18} />
          <span>
            Você tem <b>{fmtMoney(st.dirty_money)}</b> em dinheiro não declarado. Ele não aparece no saldo nem na declaração de bens; gastar ou lavar esse
            dinheiro chama a atenção do Coaf e da Receita. Veja em <a href={`/jogo/${year}/esquemas`}>Esquemas</a>.
          </span>
        </div>
      )}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title={ledger.month ? `Fechamento de ${monthLabel(ledger.month)}` : "Fechamento do mês"} icon="file" aside={series.length > 1 ? <span className="fin-spark"><Sparkline values={series} /></span> : undefined}>
            {ledger.items.length ? (
              <>
                <LedgerRows items={ledger.items} />
                <div className={`ledger-net ${ledger.net >= 0 ? "in" : "out"}`}>
                  <span>Resultado do mês</span>
                  <b className="mono">
                    {ledger.net >= 0 ? "+" : "−"} {fmtMoney(Math.abs(ledger.net))}
                  </b>
                </div>
              </>
            ) : (
              <Empty icon="file" title="Ainda não houve fechamento">
                O primeiro fechamento acontece no dia 1 do próximo mês de jogo.
              </Empty>
            )}
          </Panel>

          <Panel title="Próximo mês (estimativa)" icon="clock">
            <LedgerRows items={preview.items} />
            <div className={`ledger-net ${preview.net >= 0 ? "in" : "out"}`}>
              <span>Saldo previsto</span>
              <b className="mono">
                {preview.net >= 0 ? "+" : "−"} {fmtMoney(Math.abs(preview.net))}
              </b>
            </div>
            {preview.interest > 0 && <p className="muted small mt" style={{ marginBottom: 0 }}>Mais {fmtMoney(preview.interest)} de juros somados à dívida.</p>}
          </Panel>

          <Panel title="Extrato" icon="newspaper" aside={<span className="muted small">últimos lançamentos</span>}>
            {txs.length ? (
              <ul className="extrato">
                {txs.slice(0, 60).map((t) => (
                  <li key={t.id}>
                    <span className="mono extrato__date">{fmtDate(t.game_date)}</span>
                    <span className="extrato__desc">
                      {t.description}
                      <small>{KIND_LABEL[t.kind] ?? t.kind.toLowerCase()}</small>
                    </span>
                    <b className={`mono ${t.amount >= 0 ? "pos" : "neg"}`}>
                      {t.amount >= 0 ? "+" : "−"} {fmtMoney(Math.abs(t.amount))}
                    </b>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="newspaper" title="Nenhum lançamento ainda" />
            )}
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Crédito e dívidas" icon="coins">
            <ActionPanel year={year} actions={actions} />
          </Panel>
          <Panel title="Como o dinheiro funciona" icon="info">
            <ul className="rules">
              <li>
                <b>Salário</b>
                <span>Cai todo dia 1. Com mandato, você recebe o subsídio do cargo e a profissão fica em segundo plano.</span>
              </li>
              <li>
                <b>Subsídio</b>
                <span>Muda com o cargo e a época: deputados e senadores, 75% disso para deputados estaduais, e vereadores de 20% a 75% conforme o tamanho da cidade.</span>
              </li>
              <li>
                <b>Imposto de Renda</b>
                <span>Tabela progressiva simplificada; a partir de 2026, isenção até R$ 5 mil.</span>
              </li>
              <li>
                <b>Rendimento</b>
                <span>O saldo em conta rende perto da Selic do mês, já descontado o imposto.</span>
              </li>
              <li>
                <b>Custo de vida e partido</b>
                <span>Despesas da casa sobem com o mandato; quem tem cargo paga a contribuição estatutária ao partido.</span>
              </li>
              <li>
                <b>Dívida</b>
                <span>Se o mês fecha no vermelho, o banco cobre e cobra juros todo mês até você pagar.</span>
              </li>
              <li>
                <b>Dinheiro não declarado</b>
                <span>Vem de esquemas e ofertas ilegais. Fica fora da conta até ser lavado (com perda) ou gasto por fora.</span>
              </li>
            </ul>
            <p className="muted small mt" style={{ marginBottom: 0 }}>
              Preços da época: {Math.round(pl * 100)}% dos de 2026.
            </p>
          </Panel>
          {st.sentence && (
            <Panel title="Condenação" icon="scale" tone="alert">
              <p className="small" style={{ margin: 0 }}>
                Multa de {fmtMoney(st.sentence.fine)}
                {st.sentence.years > 0 ? ` e ${st.sentence.years} ano(s) de pena` : ""}.{" "}
                {st.sentence.ineligible_until ? <Pill tone="bad">inelegível até {fmtDate(st.sentence.ineligible_until)}</Pill> : null}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
