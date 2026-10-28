"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { quickAction } from "@/app/jogo/actions";
import type { ActionView } from "@/lib/actions-view";
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
};

const CAT: Record<string, { icon: string; label: string; cls: string }> = {
  BASE: { icon: "users", label: "Base", cls: "" },
  PARTIDO: { icon: "flag", label: "Partido", cls: "" },
  CAMPANHA: { icon: "megaphone", label: "Campanha", cls: "camp" },
  MANDATO: { icon: "landmark", label: "Mandato", cls: "" },
  INVESTIGACAO: { icon: "search", label: "Investigação", cls: "crime" },
};
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR")}`;

function ActionCard({ year, a }: { year: number; a: ActionView }) {
  const [open, setOpen] = useState(false);
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
      router.refresh();
    });
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
          </div>
        </div>
      </div>
      <p className="acard__desc">{a.description}</p>
      {locked ? (
        <div className="acard__lock">
          <Icon name="lock" size={14} /> {a.reason}
        </div>
      ) : !needsForm ? (
        <Button tone="primary" size="sm" icon="play" loading={pending} onClick={() => run({})}>
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
            run(params);
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
