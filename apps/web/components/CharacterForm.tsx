"use client";
import { useActionState, useState } from "react";
import { createCharacterAction, type ActionState } from "@/app/jogo/actions";
import { ChoiceCards, FormMessage, Select, Slider, Stepper, SubmitButton, TextField, type Option } from "./forms";

interface Axis { key: string; label: string; neg: string; pos: string }
type Choice = Option & { icon?: string };

function Block({ n, title, text, children }: { n: number; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className="cf-block">
      <header>
        <span className="cf-n">{n}</span>
        <div>
          <h2>{title}</h2>
          <p>{text}</p>
        </div>
      </header>
      <div className="cf-body">{children}</div>
    </section>
  );
}

export function CharacterForm({ year, ufs, professions, origins, axes }: { year: number; ufs: Option[]; professions: Choice[]; origins: Choice[]; axes: Axis[] }) {
  const [state, action] = useActionState<ActionState, FormData>(createCharacterAction, { ok: true, message: "" });
  const [name, setName] = useState("");
  return (
    <form action={action} noValidate autoComplete="off" className="cf">
      <input type="hidden" name="year" value={year} />
      <Block n={1} title="Identidade" text="Um nome fictício. Nomes de políticos reais são recusados.">
        <div className="cf-row">
          <TextField label="Nome do personagem" name="name" icon="user" minLength={3} maxLength={40} placeholder="Ex.: Joana Ribeiro" value={name} onChange={(e) => setName(e.target.value)} />
          <Stepper label="Idade" name="age" min={18} max={80} defaultValue={30} suffix="anos" />
        </div>
      </Block>
      <Block n={2} title="Base eleitoral" text="Seu estado. Você começa morando na capital, onde já é conhecido por algumas pessoas.">
        <Select name="uf" label="Estado" options={ufs} placeholder="Escolha o estado" />
      </Block>
      <Block n={3} title="Trajetória" text="A profissão define renda, competência e carisma iniciais. A origem define suas economias e quantas pessoas já conhecem você.">
        <ChoiceCards name="profession" label="Profissão anterior" options={professions} columns={3} />
        <ChoiceCards name="origin" label="Origem" options={origins} columns={3} />
      </Block>
      <Block n={4} title="Posições" text="Seis eixos de −100 a +100. São as posições do personagem, não as suas, e mudam a afinidade com cada partido.">
        <div className="cf-axes">
          {axes.map((a) => (
            <Slider key={a.key} name={`ax_${a.key}`} label={a.label} negLabel={a.neg} posLabel={a.pos} />
          ))}
        </div>
      </Block>
      <div className="cf-submit">
        <div>
          <b>{name.trim() || "Seu personagem"}</b>
          <span>entra na vida pública em {year}</span>
        </div>
        <SubmitButton tone="gold" size="lg" icon="play" pendingLabel="Montando o país…">
          Entrar na vida pública
        </SubmitButton>
      </div>
      {state.message && !state.ok && <FormMessage tone="err">{state.message}</FormMessage>}
    </form>
  );
}
