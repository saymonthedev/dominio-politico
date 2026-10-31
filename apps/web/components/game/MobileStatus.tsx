"use client";
import { Icon } from "../Icon";
import { LiveNumber } from "./ActionFx";
import { useLiveVitals } from "./live-vitals";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/**
 * No celular o menu lateral some: energia, caixa e reputação ficam numa faixa
 * fina sob o topo, sempre à vista (é o que decide se dá para agir agora).
 */
export function MobileStatus(props: { year: number; energy: number; money: number; reputation: number; stage: string; approval?: number | null; fatigue?: number }) {
  // os números mudam na hora em que você decide algo no meio do período
  const live = useLiveVitals(props);
  const { year } = props;
  const energy = live?.energy ?? props.energy;
  const money = live?.money ?? props.money;
  const reputation = live?.reputation ?? props.reputation;
  const stage = live?.stage ?? props.stage;
  const approval = live ? live.approval : props.approval;
  const fatigue = live?.fatigue ?? props.fatigue;
  return (
    <a className="gstat" href={`/jogo/${year}/carreira`} aria-label={`Energia ${energy} de 100, caixa ${brl(money)}, reputação ${reputation}. Ver a carreira.`}>
      <span className={`gstat__item gstat__energy${energy < 20 ? " is-low" : ""}`} title="Energia (recupera 25 por dia)">
        <Icon name="zap" size={13} />
        <b className="mono">
          <LiveNumber value={energy} />
        </b>
        <i aria-hidden="true">
          <em style={{ width: `${Math.max(0, Math.min(100, energy))}%` }} />
        </i>
      </span>
      <span className="gstat__item" title="Caixa">
        <Icon name="coins" size={13} />
        <b className="mono">
          <LiveNumber value={money} format={brl} />
        </b>
      </span>
      {approval != null ? (
        <span className="gstat__item" title="Aprovação popular do mandato">
          <Icon name="users" size={13} />
          <b className="mono">
            <LiveNumber value={approval} />%
          </b>
        </span>
      ) : (
        <span className="gstat__item" title="Reputação">
          <Icon name="star" size={13} />
          <b className="mono">
            <LiveNumber value={reputation} />
          </b>
        </span>
      )}
      {fatigue != null && fatigue >= 65 ? (
        <span className="gstat__stage gstat__tired" title="Cansaço alto: descanse (Carreira → Descansar)">cansado(a) {fatigue}</span>
      ) : (
        <span className="gstat__stage">{stage}</span>
      )}
    </a>
  );
}
