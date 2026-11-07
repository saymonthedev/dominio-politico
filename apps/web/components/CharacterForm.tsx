"use client";
import { useActionState, useState } from "react";
import { createCharacterAction, type ActionState } from "@/app/jogo/actions";
import { fmtDate, fmtMonthYear } from "@/lib/format";
import { ChoiceCards, FormMessage, Select, Slider, Stepper, SubmitButton, TextField, type Option } from "./forms";
import { Icon } from "./Icon";

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

export function CharacterForm({
  year,
  ufs,
  capitals,
  professions,
  origins,
  axes,
  privateOpen,
  privateBlocked = null,
  start,
  sharedDate,
}: {
  year: number;
  /** ainda há vagas para mundos próprios */
  privateOpen: boolean;
  /** por que não dá para criar mundo próprio: já tem um em outro ano, ou acabaram as vagas */
  privateBlocked?: "own" | "full" | null;
  /** data em que os mundos novos começam (ponto de partida real) */
  start: string;
  /** data de hoje no mundo compartilhado deste ano (null se ele ainda não existe) */
  sharedDate: string | null;
  ufs: Option[];
  capitals: Record<string, string>;
  professions: Choice[];
  origins: Choice[];
  axes: Axis[];
}) {
  const [state, action] = useActionState<ActionState, FormData>(createCharacterAction, { ok: true, message: "" });
  const [mode, setMode] = useState("SHARED");
  // o compartilhado anda com todos os jogadores: quem chega entra na data de hoje dele, não no ponto de partida
  const sharedAhead = !!sharedDate && sharedDate.slice(0, 7) > start.slice(0, 7);
  const entersOn = mode === "SHARED" && sharedAhead ? fmtMonthYear(sharedDate!) : String(year);
  const [name, setName] = useState("");
  const [uf, setUf] = useState("");
  const [cities, setCities] = useState<Record<string, Option[]>>({});
  const chooseUf = (v: string) => {
    setUf(v);
    if (v && !cities[v])
      fetch(`/api/cidades/${year}?uf=${v}`)
        .then((r) => r.json())
        .then((list: Option[]) => setCities((c) => ({ ...c, [v]: list })))
        .catch(() => undefined);
  };
  return (
    <form action={action} noValidate autoComplete="off" className="cf">
      <input type="hidden" name="year" value={year} />
      <Block n={1} title="Mundo" text="Onde você vai jogar. Não dá para trocar depois sem apagar o personagem.">
        <ChoiceCards
          name="mode"
          label="Tipo de mundo"
          columns={3}
          onChange={setMode}
          options={[
            {
              value: "SHARED",
              label: "Compartilhado",
              hint: sharedAhead
                ? `Com outros jogadores. O relógio anda para todos: hoje este mundo está em ${fmtMonthYear(sharedDate!)}.`
                : "Com outros jogadores. O relógio anda sozinho e todos veem o mesmo país.",
              icon: "users",
            },
            ...(privateOpen
              ? [
                  { value: "PRIVATE", label: "Só meu", hint: `Começa em ${fmtDate(start)}, com os dados reais e sem outros jogadores. O tempo só passa quando você avança.`, icon: "lock" },
                  { value: "FICTIONAL", label: "Fictício, só meu", hint: `Começa em ${fmtDate(start)}, com pessoas e partidos inventados. Qualquer político pode cometer crimes e ser investigado.`, icon: "book" },
                ]
              : []),
          ]}
        />
        {mode === "SHARED" && sharedAhead && (
          <p className="cf-note">
            <Icon name="info" size={15} />
            <span>
              No compartilhado você entra em <b>{fmtMonthYear(sharedDate!)}</b>, não em {year}: os jogadores de lá já passaram o tempo.
              {privateOpen ? " Para começar do início, escolha um mundo só seu." : " Para começar do início, crie um mundo só seu quando abrir vaga."}
            </span>
          </p>
        )}
        {privateOpen && <p className="muted small">Mundos próprios parados são apagados para liberar vaga, sempre com aviso por e-mail antes: os quase sem uso (menos de 30 dias de jogo) depois de 10 dias parados; os outros, depois de 90.</p>}
        {!privateOpen && privateBlocked === "own" && (
          <p className="muted small">
            Você já tem um mundo só seu em outro ponto de partida, e cada conta pode ter um. Para criar outro, apague o atual em <a href="/conta">Minha conta</a>.
          </p>
        )}
        {!privateOpen && privateBlocked !== "own" && <p className="muted small">As vagas para mundos próprios estão esgotadas no momento. Tente de novo mais tarde.</p>}
      </Block>
      <Block n={2} title="Identidade" text="Um nome fictício. Nomes de políticos reais são recusados.">
        <div className="cf-row">
          <TextField label="Nome do personagem" name="persona" icon="user" minLength={3} maxLength={40} placeholder="Ex.: Joana Ribeiro" value={name} onChange={(e) => setName(e.target.value)} />
          <Stepper label="Idade" name="age" min={18} max={80} defaultValue={30} suffix="anos" />
        </div>
      </Block>
      <Block n={3} title="Base eleitoral" text="Seu estado e sua cidade. É nela que você pode disputar prefeitura e câmara; para deputado e governo, vale o estado inteiro.">
        <div className="cf-row cf-row--even">
          <Select name="uf" label="Estado" options={ufs} placeholder="Escolha o estado" onChange={chooseUf} />
          {uf && cities[uf] ? (
            <Select key={uf} name="city" label="Cidade" options={cities[uf]} defaultValue={capitals[uf]} placeholder="Escolha a cidade" />
          ) : (
            <div className="ui-field">
              <span className="ui-label">Cidade</span>
              <div className="cf-wait">{uf ? "Carregando cidades…" : "Escolha o estado primeiro"}</div>
            </div>
          )}
        </div>
      </Block>
      <Block n={4} title="Trajetória" text="A profissão define renda, competência e carisma iniciais. A origem define suas economias e quantas pessoas já conhecem você.">
        <ChoiceCards name="profession" label="Profissão anterior" options={professions} columns={3} />
        <ChoiceCards name="origin" label="Origem" options={origins} columns={3} />
      </Block>
      <Block n={5} title="Posições" text="Seis eixos de −100 a +100. São as posições do personagem, não as suas, e mudam a afinidade com cada partido.">
        <div className="cf-axes">
          {axes.map((a) => (
            <Slider key={a.key} name={`ax_${a.key}`} label={a.label} negLabel={a.neg} posLabel={a.pos} />
          ))}
        </div>
      </Block>
      <div className="cf-submit">
        <div>
          <b>{name.trim() || "Seu personagem"}</b>
          <span>entra na vida pública em {entersOn}</span>
        </div>
        <SubmitButton tone="gold" size="lg" icon="play" pendingLabel="Montando o país…">
          Entrar na vida pública
        </SubmitButton>
      </div>
      {state.message && !state.ok && <FormMessage tone="err">{state.message}</FormMessage>}
    </form>
  );
}
