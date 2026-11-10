import {
  CAR_MODELS,
  CARS,
  carPrice,
  carValue,
  cityHousing,
  Ctx,
  ensureHousing,
  homeLabel,
  homeValue,
  housingCosts,
  housingMarket,
  netWorth,
  loansOf,
  subsidyFor,
  monthlyIncome,
  tierLabel,
  type HomeKind,
} from "@dp/engine";
import { ActionPanel } from "@/components/ActionPanel";
import { GameHeader, Kpi, Panel, Pill } from "@/components/game/Page";
import { HomeArt, VehicleArt } from "@/components/game/BensArt";
import { HomeMarket } from "@/components/game/HomeMarket";
import { QuickAction } from "@/components/game/QuickAction";
import { Icon } from "@/components/Icon";
import { actionsFor } from "@/lib/actions-view";
import { fmtDate, fmtMoney } from "@/lib/format";
import { playerState, requireMe } from "@/lib/game";
import { geoName } from "@dp/engine";
import { citiesFor } from "@/lib/sim";

const KIND: Record<HomeKind, { label: string; tone: "ok" | "gold" | "warn" | "neutral" }> = {
  FAMILIA: { label: "com a família", tone: "neutral" },
  ALUGUEL: { label: "aluguel", tone: "neutral" },
  PROPRIA: { label: "casa própria", tone: "ok" },
  RUA: { label: "sem casa", tone: "warn" },
};

export default async function Page({ params }: { params: Promise<{ ano: string }> }) {
  const year = Number((await params).ano);
  const me = await requireMe(year);
  const [state, cities] = await Promise.all([playerState(year), citiesFor(year)]);
  const ctx = new Ctx(state, "view");
  const p = state.t.persons.get(me.person.id) ?? me.person;
  const st = state.t.person_states.get(me.person.id) ?? me.state;
  const story = ensureHousing(state, p, st, state.world.game_date);
  const home = story.home!;
  const car = story.car ?? null;
  const city = home.city;
  const cityName = geoName(city, { cities });
  const ch = cityHousing(state, city);
  const subsidy = p.office_code ? subsidyFor(ctx, p.office_code, p.office_geo) : 0;
  const income = monthlyIncome(ctx, p, st, subsidy);
  const costs = housingCosts(ctx, p, st, income);
  const monthly = costs.reduce((s, i) => s - i.amount, 0);
  const houseVal = homeValue(state, home);
  const carVal = car ? carValue(state, car, state.world.game_date) : 0;
  const market = housingMarket(state, city).map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q, label: tierLabel(q.tier) })) }));
  const actions = actionsFor(state, me.person.id, ["BENS"]);
  const kindLabel = ch.kind === "b" ? "bairros" : "distritos";

  return (
    <>
      <GameHeader
        kicker="Você"
        icon="home"
        title="Bens"
        lede={`Onde você mora, o que tem e o que deve. Os ${kindLabel} de ${cityName} são os do Censo 2022 (IBGE); o preço do metro quadrado é uma estimativa do jogo a partir da renda de cada um.`}
      />

      <div className="kpis mb">
        <Kpi icon="landmark" label="Patrimônio líquido" value={fmtMoney(netWorth(st))} hint={`bens declarados: ${fmtMoney(st.assets)}`} tone={netWorth(st) < 0 ? "down" : undefined} />
        <Kpi icon="home" label="Moradia" value={home.kind === "PROPRIA" ? fmtMoney(houseVal) : home.kind === "ALUGUEL" ? `${fmtMoney(home.rent)}/mês` : KIND[home.kind].label} hint={homeLabel(home)} />
        <Kpi icon="coins" label="Casa e carro por mês" value={fmtMoney(monthly)} hint="aluguel, prestações, IPTU, IPVA, seguro, combustível" />
        <Kpi icon="alert" label="Financiamentos" value={fmtMoney(loansOf(st))} hint={loansOf(st) ? "saldo devedor de casa e carro" : "nenhum"} tone={loansOf(st) ? "warn" : undefined} />
      </div>

      {home.kind === "RUA" && (
        <div className="hint-band hint-band--danger">
          <Icon name="alert" size={18} />
          <span>
            Você está <b>sem casa</b>. A saúde cai, o cansaço não passa, a energia volta mais devagar e as pessoas olham diferente. Alugue um lugar abaixo ou volte para a casa da
            família em <b>Ações</b>.
          </span>
        </div>
      )}

      <div className="ggrid ggrid--main">
        <div className="gstack">
          <Panel title="Onde você mora" icon="home" aside={<Pill tone={KIND[home.kind].tone}>{KIND[home.kind].label}</Pill>}>
            <div className="bhome">
              <HomeArt tier={home.tier} kind={home.kind} className="bhome__art" />
              <div className="bhome__main">
                <b>{home.kind === "RUA" ? "Sem endereço" : `${home.bairro}, ${cityName}`}</b>
                <span>
                  {home.kind === "FAMILIA"
                    ? "Na casa da família: você ajuda nas contas."
                    : home.kind === "RUA"
                      ? `Desde ${fmtDate(home.since)}.`
                      : `${tierLabel(home.tier).replace(/^./, (x) => x.toUpperCase())}, ${home.size} m² · desde ${fmtDate(home.since)}`}
                </span>
              </div>
              {home.kind === "PROPRIA" && (
                <dl className="bhome__facts">
                  <div>
                    <dt>Valor de mercado</dt>
                    <dd className="mono">{fmtMoney(houseVal)}</dd>
                  </div>
                  {home.loan && (
                    <>
                      <div>
                        <dt>Saldo do financiamento</dt>
                        <dd className="mono">{fmtMoney(home.loan.balance)}</dd>
                      </div>
                      <div>
                        <dt>Prestação</dt>
                        <dd className="mono">
                          {fmtMoney(home.loan.installment)} · faltam {home.loan.months}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>
              )}
              {home.kind === "ALUGUEL" && (
                <dl className="bhome__facts">
                  <div>
                    <dt>Aluguel</dt>
                    <dd className="mono">{fmtMoney(home.rent)}/mês</dd>
                  </div>
                  <div>
                    <dt>Reajuste</dt>
                    <dd>todo ano, pelo IPCA</dd>
                  </div>
                </dl>
              )}
            </div>
            {costs.length > 0 && (
              <ul className="ledger mt">
                {costs.map((i, n) => (
                  <li key={n} className="out">
                    <span>{i.label}</span>
                    <b className="mono">− {fmtMoney(Math.abs(i.amount))}</b>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title={`Mudar de casa: ${kindLabel} de ${cityName}`} icon="map">
            <HomeMarket year={year} bairros={market} homeKind={home.kind} homeBairro={home.bairro} money={st.money} kindLabel={kindLabel} />
          </Panel>
        </div>

        <div className="gstack">
          <Panel title="Seu carro" icon="briefcase" aside={car ? <Pill tone="ok">{CARS[car.model].label}</Pill> : <Pill>sem carro</Pill>}>
            {car && <VehicleArt model={car.model} className="bhome__art mb" />}
            {car ? (
              <dl className="bhome__facts">
                <div>
                  <dt>Valor de mercado</dt>
                  <dd className="mono">{fmtMoney(carVal)}</dd>
                </div>
                <div>
                  <dt>Desde</dt>
                  <dd>{fmtDate(car.since)}</dd>
                </div>
                {car.loan && (
                  <div>
                    <dt>Prestação</dt>
                    <dd className="mono">
                      {fmtMoney(car.loan.installment)} · faltam {car.loan.months}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="muted small" style={{ marginTop: 0 }}>
                Sem carro, você depende de ônibus e aplicativo: numa cidade grande, o deslocamento cansa mais.
              </p>
            )}
            <ul className="bcars">
              {CAR_MODELS.map((m) => {
                const price = carPrice(state, m);
                return (
                  <li key={m} className={car?.model === m ? "is-mine" : ""}>
                    <VehicleArt model={m} className="bcars__art" />
                    <div className="bcars__info">
                      <b>{CARS[m].label.replace(/^./, (x) => x.toUpperCase())}</b>
                      <small className="mono">{fmtMoney(price)}</small>
                    </div>
                    {car?.model !== m && (
                      <div className="bcars__btns">
                        {st.money >= price - (car ? carVal * 0.9 : 0) && <QuickAction year={year} action="comprar_carro" params={{ modelo: m, pagamento: "VISTA" }} label="À vista" tone="gold" />}
                        <QuickAction year={year} action="comprar_carro" params={{ modelo: m, pagamento: "FINANCIADO" }} label="Financiar" tone="ghost" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="muted small">Financiamento em 48 meses, com entrada de 20%. O carro atual entra na troca. IPVA, seguro e combustível entram no custo do mês.</p>
          </Panel>

          <Panel title="Ações" icon="play">
            <ActionPanel year={year} actions={actions.filter((a) => !["alugar_imovel", "comprar_imovel", "comprar_carro"].includes(a.id))} empty="Nada a fazer agora." />
          </Panel>

          <Panel title="Como funciona" icon="info">
            <ul className="bhelp">
              <li>Morar com a família é barato, mas tem limite de paciência — e de espaço.</li>
              <li>Aluguel tem caução e é reajustado todo ano pela inflação.</li>
              <li>Casa própria valoriza com a inflação; financiada, a prestação não pode passar de 35% da renda.</li>
              <li>Sem casa, a saúde e a imagem sofrem todo dia.</li>
              <li>Casa de luxo e carro importado com mandato chamam a atenção da imprensa.</li>
              <li>Renda considerada pelo banco: {fmtMoney(income)} por mês.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
