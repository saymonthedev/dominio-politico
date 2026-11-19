import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/AuthForms";
import { DeleteAccount } from "@/components/DeleteAccount";
import { Checkbox, FormMessage, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/Icon";
import { AppHeader, Footer, PageHero } from "@/components/SiteChrome";
import { getSession, myCharacters } from "@/lib/game";
import { fmtDate } from "@/lib/format";
import { deleteMyWorld } from "@/app/jogo/actions";
import { modeOfWorld, yearOfWorld } from "@/lib/sim";
import { ShareButton } from "@/components/ShareButton";
import { inviteShare, sharePack } from "@/lib/share";

export const metadata: Metadata = { title: "Minha conta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ senha?: string; email?: string; mundo?: string }> }) {
  const { senha, email: emailFlag, mundo } = await searchParams;
  const { sb } = await getSession();
  // dados completos da conta (criação, confirmação do e-mail): aqui vale a ida ao servidor de login
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/entrar?next=/conta");
  const chars = await myCharacters();
  const email = user.email ?? "";
  const own = chars.filter((c) => modeOfWorld(c.world_id) !== "SHARED");
  // convite de amigos: o código da conta e quantos amigos já vieram e assinaram
  const [codeQ, statsQ] = await Promise.all([sb.rpc("referral_code"), sb.rpc("referral_stats")]);
  const code = typeof codeQ.data === "string" ? codeQ.data : null;
  const stats = (statsQ.data as { invited?: number; rewarded?: number } | null) ?? {};
  // o nome do personagem vai no cartão (o ativo, se houver); busca pela chave da tabela (mundo e id)
  let first = "Um amigo";
  if (chars.length) {
    const { data } = await sb
      .from("persons")
      .select("name, status")
      .in("world_id", [...new Set(chars.map((c) => c.world_id))])
      .in("id", chars.map((c) => c.person_id));
    const rows = (data ?? []) as Array<{ name: string; status: string }>;
    first = rows.find((r) => r.status === "ACTIVE")?.name ?? rows[0]?.name ?? first;
  }
  const invite = code ? sharePack(code, inviteShare(first).card, inviteShare(first).text) : null;
  return (
    <>
      <AppHeader />
      <PageHero kicker="Conta" title="Minha conta" lede="Seus dados de acesso, sua cópia dos dados e a opção de sair do jogo de vez." />
      <main className="container page-body">
        <div className="account">
          {senha === "nova" && <FormMessage tone="ok">Senha nova salva. Ela já vale no próximo acesso.</FormMessage>}
          {mundo === "apagado" && <FormMessage tone="ok">Mundo próprio apagado. Você pode criar outro quando quiser.</FormMessage>}
          {mundo === "erro" && <FormMessage tone="err">Marque a confirmação para apagar o mundo.</FormMessage>}
          {emailFlag === "confirmado" && <FormMessage tone="ok">E-mail confirmado. Se a troca segura estiver ligada, confirme também pelo link enviado ao endereço antigo.</FormMessage>}
          <section className="account-card account-id">
            <span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span>
            <div>
              <b>{email}</b>
              <span>Conta criada em {fmtDate(user.created_at?.slice(0, 10))}</span>
            </div>
            <div className="account-stats">
              <div>
                <b>{chars.length}</b>
                <span>{chars.length === 1 ? "personagem" : "personagens"}</span>
              </div>
              <div>
                <b>{user.email_confirmed_at ? "Sim" : "Não"}</b>
                <span>e-mail confirmado</span>
              </div>
            </div>
            <a className="ui-btn ui-btn--ghost" href="/jogo">
              <Icon name="flag" size={18} /> <span>Meus mundos</span>
            </a>
          </section>

          {invite && (
            <section className="account-card" id="convite">
              <div className="refer">
                <div>
                  <h2 style={{ margin: 0 }}>
                    <Icon name="gift" size={20} /> Convide amigos e ganhe dias de jogo
                  </h2>
                  <p className="muted small" style={{ margin: "6px 0 0" }}>
                    Mande o seu link no WhatsApp ou poste o cartão no story. A cada amigo que criar a conta pelo seu link e assinar, você ganha <b>7 dias de jogo</b>, somados à sua assinatura.
                  </p>
                </div>
                <div className="refer__stats">
                  <div>
                    <b>{stats.invited ?? 0}</b>
                    <span className="muted small">{(stats.invited ?? 0) === 1 ? "amigo entrou" : "amigos entraram"} pelo seu link</span>
                  </div>
                  <div>
                    <b>{(stats.rewarded ?? 0) * 7} dias</b>
                    <span className="muted small">ganhos com {stats.rewarded ?? 0} {(stats.rewarded ?? 0) === 1 ? "amigo que assinou" : "amigos que assinaram"}</span>
                  </div>
                </div>
                <div>
                  <ShareButton share={{ link: invite.link, text: invite.text, story: invite.story }} label="Convidar amigos" tone="gold" />
                </div>
              </div>
            </section>
          )}

          {own.map((c) => (
            <section key={c.world_id} className="account-card account-card--form danger">
              <header>
                <span className="ico"><Icon name="globe" size={20} /></span>
                <div>
                  <h2>Mundo próprio pós-{yearOfWorld(c.world_id)}{modeOfWorld(c.world_id) === "FICTIONAL" ? " (fictício)" : ""}</h2>
                  <p>Só você joga nele. Apagar remove o mundo inteiro e o seu personagem, sem volta, e libera a vaga para criar outro. Se ficar parado, ele é apagado sozinho para liberar vaga, sempre com aviso por e-mail antes: os quase sem uso (menos de 30 dias de jogo) depois de 10 dias parados; os outros, depois de 90.</p>
                </div>
              </header>
              <form action={deleteMyWorld} className="account-form">
                <input type="hidden" name="world" value={c.world_id} />
                <Checkbox name="confirm" required>
                  Entendo que não dá para desfazer
                </Checkbox>
                <SubmitButton tone="danger" icon="trash" pendingLabel="Apagando…">
                  Apagar este mundo
                </SubmitButton>
              </form>
            </section>
          ))}

          <section className="account-card account-card--form">
            <header>
              <span className="ico"><Icon name="lock" size={20} /></span>
              <div>
                <h2>Trocar senha</h2>
                <p>Confirme a senha atual e escolha uma nova, com pelo menos 8 caracteres.</p>
              </div>
            </header>
            <ChangePasswordForm />
          </section>

          <section className="account-card account-card--form">
            <header>
              <span className="ico"><Icon name="mail" size={20} /></span>
              <div>
                <h2>Trocar e-mail</h2>
                <p>Enviamos um link de confirmação para o endereço novo. A troca só vale depois do clique.</p>
              </div>
            </header>
            <ChangeEmailForm />
          </section>

          <section className="account-card">
            <header>
              <span className="ico"><Icon name="download" size={20} /></span>
              <div>
                <h2>Exportar meus dados</h2>
                <p>Uma cópia em JSON com sua conta, personagens, notificações e histórico. Direito de acesso e portabilidade da LGPD.</p>
              </div>
            </header>
            <a className="ui-btn ui-btn--primary" href="/api/meus-dados">
              <Icon name="download" size={18} /> <span>Baixar arquivo</span>
            </a>
          </section>

          <section className="account-card danger">
            <header>
              <span className="ico"><Icon name="trash" size={20} /></span>
              <div>
                <h2>Excluir conta</h2>
                <p>Personagens aposentados sem evento negativo, dados privados apagados e conta de acesso removida.</p>
              </div>
            </header>
            <DeleteAccount />
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
