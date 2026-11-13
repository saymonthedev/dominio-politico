import { redirect } from "next/navigation";
import { Checkout } from "@/components/Checkout";
import { ContentPage } from "@/components/ContentPage";
import { Icon } from "@/components/Icon";
import { AUTHOR } from "@/lib/author";
import { fmtDay } from "@/lib/format";
import { getSession, myPaidUntil } from "@/lib/game";
import { isExempt, paywallOn, PERIOD_DAYS, PRICE } from "@/lib/payments";
import { pageMeta } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMeta({
  title: "Assinatura",
  path: "/assinar",
  description:
    "Assine o Domínio Político por R$ 3 por mês, com Pix. O acesso libera na hora.",
  index: false,
});

/** Assinatura mensal: situação da conta, o que inclui e o pagamento por Pix. */
export default async function Page() {
  const { user } = await getSession();
  if (!user) redirect("/entrar?next=/assinar");
  const on = paywallOn();
  const exempt = isExempt(user.id);
  const paidUntil = await myPaidUntil();
  const active = !!paidUntil && Date.parse(paidUntil) > Date.now();

  return (
    <ContentPage
      kicker="Assinatura"
      title="Assine o Domínio Político"
      lede={`R$ ${PRICE} por mês, por Pix. É a assinatura que mantém os servidores no ar e o jogo crescendo, feito por uma pessoa só.`}
    >
      <section className="pay">
        <div className="pay__main">
          {active ? (
            <p className="pay__state is-ok">
              <Icon name="check" size={18} />
              <span>
                Sua assinatura vale até <b>{fmtDay(paidUntil!)}</b>. Obrigado
                por apoiar o jogo! Se quiser, já dá para renovar: os{" "}
                {PERIOD_DAYS} dias somam ao que ainda falta.{" "}
                <a href="/jogo">Ir para o jogo</a>
              </span>
            </p>
          ) : exempt ? (
            <p className="pay__state is-ok">
              <Icon name="shield" size={18} />
              <span>
                Sua conta joga sem assinatura (administração). O pagamento
                abaixo funciona normalmente, se quiser testar.{" "}
                <a href="/jogo">Ir para o jogo</a>
              </span>
            </p>
          ) : !on ? (
            <p className="pay__state is-ok">
              <Icon name="info" size={18} />
              <span>
                As assinaturas ainda não começaram: por enquanto o jogo segue
                aberto. <a href="/jogo">Ir para o jogo</a>
              </span>
            </p>
          ) : (
            <p className="pay__state">
              <Icon name="lock" size={18} />
              <span>
                {paidUntil
                  ? `Sua assinatura venceu em ${fmtDay(paidUntil)}.`
                  : "O jogo agora é por assinatura."}{" "}
                Para continuar jogando, assine por R$ {PRICE} por mês. Seus
                personagens e mundos continuam guardados e voltam do jeito que
                você deixou.
              </span>
            </p>
          )}

          {on && <Checkout price={PRICE} days={PERIOD_DAYS} renew={active} />}
        </div>

        <aside className="pay__side" aria-labelledby="pay-side-title">
          <h2 id="pay-side-title">O que a assinatura inclui</h2>
          <ul className="pay__perks">
            <li>
              <Icon name="check" size={16} />
              <span>
                Todos os mundos: os compartilhados com outros jogadores, o só
                seu e o fictício.
              </span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span>
                Cada Pix vale {PERIOD_DAYS} dias de jogo e libera sozinho assim
                que o pagamento cai. Sem cartão e sem renovação automática:
                perto de vencer, o jogo avisa.
              </span>
            </li>
            <li>
              <Icon name="check" size={16} />
              <span>
                Se a assinatura vencer, nada se perde: seus personagens ficam
                guardados.
              </span>
            </li>
          </ul>
          <p className="pay__fine">
            Pagamento processado pelo Mercado Pago. Pagou e se arrependeu? Em
            até 7 dias do pagamento, devolvemos o valor: é só pedir pelo
            Instagram{" "}
            <a href={AUTHOR.instagram} target="_blank" rel="noopener">
              {AUTHOR.handle}
            </a>
            . Detalhes nos <a href="/termos#assinatura">Termos de Uso</a>.
          </p>
        </aside>
      </section>
    </ContentPage>
  );
}
