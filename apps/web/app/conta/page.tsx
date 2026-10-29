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

export const metadata: Metadata = { title: "Minha conta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ senha?: string; email?: string; mundo?: string }> }) {
  const { senha, email: emailFlag, mundo } = await searchParams;
  const { user } = await getSession();
  if (!user) redirect("/entrar?next=/conta");
  const chars = await myCharacters();
  const email = user.email ?? "";
  const own = chars.filter((c) => modeOfWorld(c.world_id) !== "SHARED");
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

          {own.map((c) => (
            <section key={c.world_id} className="account-card account-card--form danger">
              <header>
                <span className="ico"><Icon name="globe" size={20} /></span>
                <div>
                  <h2>Mundo próprio pós-{yearOfWorld(c.world_id)}{modeOfWorld(c.world_id) === "FICTIONAL" ? " (fictício)" : ""}</h2>
                  <p>Só você joga nele. Apagar remove o mundo inteiro e o seu personagem, sem volta, e libera a vaga para criar outro. Se ficar 90 dias sem uso, ele é apagado sozinho, com aviso por e-mail uma semana antes.</p>
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
