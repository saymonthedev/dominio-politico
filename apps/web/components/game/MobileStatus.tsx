"use client";
import { Icon } from "../Icon";
import { LiveNumber } from "./ActionFx";

const brl = (v: number) => `R$ ${Math.round(v).toLocaleString("pt-BR")}`;

/**
 * No celular o menu lateral some: energia, caixa e reputação ficam numa faixa
 * fina sob o topo, sempre à vista (é o que decide se dá para agir agora).
 */
export function MobileStatus({ year, energy, money, reputation, stage }: { year: number; energy: number; money: number; reputation: number; stage: string }) {
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
      <span className="gstat__item" title="Reputação">
        <Icon name="star" size={13} />
        <b className="mono">
          <LiveNumber value={reputation} />
        </b>
      </span>
      <span className="gstat__stage">{stage}</span>
    </a>
  );
}
