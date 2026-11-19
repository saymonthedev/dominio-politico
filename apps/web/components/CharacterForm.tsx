"use client";
import { useActionState, useState } from "react";
import { createCharacterAction, type ActionState } from "@/app/jogo/actions";
import { fmtDate, fmtMonthYear } from "@/lib/format";
import { ChoiceCards, FormMessage, Select, Slider, Stepper, SubmitButton, TextField, type Option } from "./forms";
import { Icon } from "./Icon";

interface Axis { key: string; label: string; neg: string; pos: string }
type Choice = Option & { icon?: string };

/** Criar rápido: nomes sugeridos (sem nenhum nome real), o gênero inicial e o estado da conexão. */
export interface QuickStart {
  F: string[];
  M: string[];
  gender: "F" | "M";
  /** estado sugerido (região da conexão), ou vazio */
  uf: string;
  /** nome da capital de cada estado (a base do personagem rápido) */
  capitals: Record<string, string>;
}

/**
 * Criar rápido (19/11): nome sugerido, mulher ou homem e o estado; o resto no padrão (30 anos,
 * professor(a), classe média, posições de centro, mundo compartilhado, base na capital).
 */
function QuickCreate({ year, quick, ufs, entersOn }: { year: number; quick: QuickStart; ufs: Option[]; entersOn: string }) {
  const [state, action] = useActionState<ActionState, FormData>(createCharacterAction, { ok: true, message: "" });
  const [gender, setGender] = useState<"F" | "M">(quick.gender);
  const [idx, setIdx] = useState(0);
  const [name, setName] = useState(quick[quick.gender][0] ?? "");
  const [uf, setUf] = useState(quick.uf);
  // nome ainda sugerido (não digitado): trocar o gênero troca o nome junto
  const suggested = quick.F.includes(name) || quick.M.includes(name);
  const choose = (g: "F" | "M") => {
    setGender(g);
    if (suggested) {
      setIdx(0);
      setName(quick[g][0] ?? name);
    }
  };
  const another = () => {
    const list = quick[gender];
    const next = (idx + 1) % list.length;
    setIdx(next);
    setName(list[next]);
  };
  const capital = uf ? quick.capitals[uf] : "";
  return (
    <form action={action} noValidate autoComplete="off" className="qc" aria-labelledby="qc-title">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="mode" value="SHARED" />
      <input type="hidden" name="gender" value={gender} />
      <input type="hidden" name="age" value="30" />
      <input type="hidden" name="profession" value="professor" />
      <input type="hidden" name="origin" value="classe_media" />
      <div className="qc__head">
        <span className="qc__kicker">
          <Icon name="zap" size={15} /> Criar rápido
        </span>
        <h2 id="qc-title">Pressa para jogar? Escolha o estado e entre.</h2>
        <p>O resto já vem pronto. Prefere decidir cada detalhe? O formulário completo está logo abaixo.</p>
      </div>
      <div className="qc__fields">
        <div className="ui-field">
          <span className="ui-label">O personagem é</span>
          <div className="qc__seg" role="group" aria-label="O personagem é">
            {(["F", "M"] as const).map((g) => (
              <button key={g} type="button" aria-pressed={gender === g} onClick={() => choose(g)}>
                {g === "F" ? "Mulher" : "Homem"}
              </button>
            ))}
          </div>
        </div>
        <div className="qc__name">
          <TextField label="Nome do personagem" name="persona" icon="user" minLength={3} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className="qc__dice" onClick={another} aria-label="Sortear outro nome" title="Sortear outro nome">
            <Icon name="shuffle" size={17} />
          </button>
        </div>
        <Select name="uf" label="Estado" options={ufs} defaultValue={quick.uf} placeholder="Escolha o estado" onChange={setUf} />
      </div>
      <div className="qc__foot">
        <p>
          {gender === "F" ? "Professora" : "Professor"}, 30 anos, classe média{capital ? `, com base em ${capital}` : ", com base na capital do estado"}. Posições de centro, no mundo compartilhado,
          a partir de {entersOn}.
        </p>
        <SubmitButton tone="gold" icon="play" pendingLabel="Montando o país…" disabled={!uf || name.trim().length < 3}>
          Criar e jogar
        </SubmitButton>
      </div>
      {state.message && !state.ok && <FormMessage tone="err">{state.message}</FormMessage>}
    </form>
  );
}

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
  quick = null,
}: {
  year: number;
  /** Criar rápido (sem sugestões, só o formulário completo) */
  quick?: QuickStart | null;
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
  // o Criar rápido é sempre no compartilhado
  const quickEnters = sharedAhead ? fmtMonthYear(sharedDate!) : String(year);
  return (
    <div className="cf-col">
      {quick && (
        <>
          <QuickCreate year={year} quick={quick} ufs={ufs} entersOn={quickEnters} />
          <div className="cf-or" role="separator">
            <span>ou monte o seu personagem do seu jeito</span>
          </div>
        </>
      )}
      <form action={action} noValidate autoComplete="off" className="cf">
        <input type="hidden" name="year" value={year} />
        <Block n={1} title="Mundo" text="Onde você vai jogar. Não dá para trocar depois sem apagar o personagem.">
          <ChoiceCards
            name="mode"
            label="Tipo de mundo"
            // vagas de mundos próprios esgotadas: o compartilhado sozinho ocupa a linha toda
            columns={privateOpen ? 3 : 1}
            onChange={setMode}
            options={[
              {
                value: "SHARED",
                label: "Compartilhado",
                hint: sharedAhead
                  ? `Com outros jogadores, em rodadas de 2 horas: em cada uma você vive até 2 meses de jogo no seu ritmo, e na virada o mundo anda para todos. Hoje este mundo está em ${fmtMonthYear(sharedDate!)}.`
                  : "Com outros jogadores, em rodadas de 2 horas: em cada uma você vive até 2 meses de jogo no seu ritmo, e na virada o mundo anda para todos.",
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
                No compartilhado você entra em <b>{fmtMonthYear(sharedDate!)}</b>, não em {year}: o tempo de lá já andou.
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
        <Block n={2} title="Identidade" text="Um nome fictício e como o jogo fala do personagem. Nomes de políticos reais são recusados.">
          <div className="cf-row">
            <TextField label="Nome do personagem" name="persona" icon="user" minLength={3} maxLength={40} placeholder="Ex.: Joana Ribeiro" value={name} onChange={(e) => setName(e.target.value)} />
            <Stepper label="Idade" name="age" min={18} max={80} defaultValue={30} suffix="anos" />
          </div>
          <ChoiceCards
            name="gender"
            label="O personagem é"
            defaultValue=""
            options={[
              { value: "F", label: "Mulher", hint: "O jogo escreve eleita, vereadora, cidadã.", icon: "user" },
              { value: "M", label: "Homem", hint: "O jogo escreve eleito, vereador, cidadão.", icon: "user" },
              { value: "", label: "Prefiro não dizer", hint: "Os textos ficam no neutro: eleito(a), vereador(a).", icon: "user" },
            ]}
          />
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
    </div>
  );
}
