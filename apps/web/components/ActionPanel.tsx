"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAction } from "@/app/jogo/actions";
import type { ActionView } from "@/lib/actions-view";
import { useModal } from "./a11y";
import { Button, Select, TextField } from "./forms";
import { Icon } from "./Icon";
import { useToast } from "./game/Toaster";

/** Ícone próprio de cada ação; sem entrada, vale o da categoria. */
const ACTION_ICON: Record<string, string> = {
  trabalhar: "briefcase", evento_local: "home", voluntariado: "users", artigo: "newspaper", reuniao_partidaria: "flag", conversar: "users",
  curso: "book", pedir_filiacao: "flag", responder_convite: "mail", desfiliar: "logout", militancia: "megaphone", aproximar_faccao: "sliders",
  contribuir_partido: "coins", pre_candidatura: "ballot", comicio: "megaphone", lancar_proposta: "file", mobilizacao_regional: "map",
  contratar_equipe: "briefcase", preparar_debate: "users", impulsionar_boato: "alert", votar_projeto: "ballot", apresentar_projeto: "file",
  destinar_emenda: "coins", fiscalizar_governo: "eye", lancar_politica: "trending", abrir_cpi: "gavel", investigar: "search", denunciar: "shield",
  vazar_imprensa: "newspaper", responder_oferta: "alert", contratar_defesa: "scale", colaborar: "key", nota_publica: "megaphone",
  investigar_partido: "search", denunciar_partido: "shield", rachadinha: "coins", funcionario_fantasma: "user", desviar_cota: "file",
  nomear_parentes: "users", cobrar_propina: "coins", fraudar_licitacao: "file", desviar_verba: "landmark", desviar_emenda: "coins",
  vender_influencia: "key", buscar_caixa_dois: "coins", comprar_votos: "ballot", usar_maquina: "landmark", gastar_por_fora: "coins",
  pagar_mesada: "coins", lancar_laranjas: "users", desviar_fundo: "flag", lavar_dinheiro: "coins", obstruir_investigacao: "trash",
  encerrar_esquema: "x", fundar_partido: "flag", coletar_assinaturas: "file", mobilizar_voluntarios: "users", desistir_fundacao: "x",
  filiar_meu_partido: "flag", decidir_filiacao: "check", convidar_filiacao: "mail", pegar_emprestimo: "coins", quitar_divida: "check",
  indicar_candidato: "ballot", retirar_indicacao: "x", repassar_fundo: "coins",
};

const CAT: Record<string, { icon: string; label: string; cls: string }> = {
  BASE: { icon: "users", label: "Base", cls: "" },
  PARTIDO: { icon: "flag", label: "Partido", cls: "" },
  CAMPANHA: { icon: "megaphone", label: "Campanha", cls: "camp" },
  MANDATO: { icon: "landmark", label: "Mandato", cls: "" },
  INVESTIGACAO: { icon: "search", label: "Investigação", cls: "" },
  ESQUEMA: { icon: "key", label: "Esquema", cls: "crime" },
  MEU_PARTIDO: { icon: "flag", label: "Meu partido", cls: "camp" },
  FINANCAS: { icon: "coins", label: "Finanças", cls: "" },
};
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

function ConfirmDialog({ title, text, onCancel, onConfirm, pending }: { title: string; text: string; onCancel: () => void; onConfirm: () => void; pending: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  // em ação irreversível, o foco começa em "Cancelar"
  useModal(box, true, () => !pending && onCancel(), { initial: "[data-cancel]" });
  return (
    <div className="ui-overlay" onMouseDown={(e) => e.target === e.currentTarget && !pending && onCancel()}>
      <div className="ui-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" ref={box}>
        <span className="ui-dialog__icon">
          <Icon name="alert" size={24} />
        </span>
        <h2 id="confirm-title">{title}?</h2>
        <p id="confirm-text">{text}</p>
        <div className="ui-dialog__actions">
          <Button type="button" tone="ghost" onClick={onCancel} data-cancel="">
            Cancelar
          </Button>
          <Button type="button" tone="danger" loading={pending} onClick={onConfirm}>
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActionCard({ year, a }: { year: number; a: ActionView }) {
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<Record<string, string> | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const locked = !!a.reason;
  const needsForm = a.params.length > 0;
  const run = (params: Record<string, string>) =>
    start(async () => {
      const r = await quickAction(year, a.id, params);
      toast({ tone: r.ok ? "ok" : "err", title: r.ok ? a.label : "Não deu certo", body: r.message });
      if (r.ok) setOpen(false);
      setAsking(null);
      router.refresh();
    });
  const attempt = (params: Record<string, string>) => (a.confirm ? setAsking(params) : run(params));
  return (
    <article className={`acard${locked ? " is-locked" : ""}${open ? " is-open" : ""}`}>
      <div className="acard__top">
        <span className={`acard__icon ${CAT[a.category]?.cls ?? ""}`} aria-hidden="true">
          <Icon name={ACTION_ICON[a.id] ?? CAT[a.category]?.icon ?? "flag"} size={18} />
        </span>
        <div className="acard__title">
          <b>{a.label}</b>
          <div className="acard__chips">
            {a.energy > 0 && (
              <span className="cost-chip">
                <Icon name="zap" size={12} /> {a.energy} de energia
              </span>
            )}
            {!!a.cost && <span className="cost-chip">{brl(a.cost)}</span>}
            {a.crime && <span className="cost-chip cost-chip--crime">ilegal · {a.crime.sphere}</span>}
          </div>
        </div>
      </div>
      <p className="acard__desc">{a.description}</p>
      {a.crime && (
        <p className="acard__law">
          <Icon name="scale" size={13} /> {a.crime.law}
        </p>
      )}
      {locked ? (
        <div className="acard__lock">
          <Icon name="lock" size={14} /> {a.reason}
        </div>
      ) : !needsForm ? (
        <Button tone={a.confirm ? "danger" : "primary"} size="sm" icon="play" loading={pending} onClick={() => attempt({})}>
          Fazer agora
        </Button>
      ) : !open ? (
        <Button tone="primary" size="sm" icon="sliders" onClick={() => setOpen(true)}>
          Escolher e fazer
        </Button>
      ) : (
        <form
          className="acard__form"
          noValidate
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const params: Record<string, string> = {};
            for (const [k, v] of new FormData(e.currentTarget).entries()) if (typeof v === "string" && v !== "") params[k] = v;
            attempt(params);
          }}
        >
          {a.params.map((p) =>
            p.options ? (
              <Select key={p.name} name={p.name} label={p.label} options={p.options} optional={p.optional} />
            ) : (
              <TextField key={p.name} name={p.name} label={p.label} optional={p.optional} inputMode={p.type === "number" ? "numeric" : undefined} maxLength={90} />
            ),
          )}
          <div className="acard__formactions">
            <Button type="button" tone="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" tone="gold" size="sm" icon="play" loading={pending}>
              Fazer
            </Button>
          </div>
        </form>
      )}
      {asking && a.confirm && <ConfirmDialog title={a.label} text={a.confirm} pending={pending} onCancel={() => setAsking(null)} onConfirm={() => run(asking)} />}
    </article>
  );
}

/** Ações disponíveis do personagem em cartões; as bloqueadas ficam agrupadas no fim, com o motivo. */
export function ActionPanel({ year, actions, empty }: { year: number; actions: ActionView[]; empty?: string }) {
  const [showLocked, setShowLocked] = useState(false);
  if (!actions.length) return <div className="gempty"><span className="gempty__text">{empty ?? "Nenhuma ação nesta categoria."}</span></div>;
  const ready = actions.filter((a) => !a.reason);
  const locked = actions.filter((a) => a.reason);
  return (
    <div className="actions2">
      {ready.length > 0 ? (
        <div className="agrid">
          {ready.map((a) => (
            <ActionCard key={a.id} year={year} a={a} />
          ))}
        </div>
      ) : (
        <div className="gempty">
          <span className="gempty__text">{empty ?? "Nenhuma ação disponível agora."}</span>
        </div>
      )}
      {locked.length > 0 && (
        <div className="alocked">
          <button type="button" className="alocked__toggle" aria-expanded={showLocked} onClick={() => setShowLocked((v) => !v)}>
            <Icon name="lock" size={15} /> {locked.length} {locked.length === 1 ? "ação bloqueada" : "ações bloqueadas"} por enquanto
            <Icon name="chevron" size={16} className={showLocked ? "rot" : ""} />
          </button>
          {showLocked && (
            <div className="agrid">
              {locked.map((a) => (
                <ActionCard key={a.id} year={year} a={a} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
