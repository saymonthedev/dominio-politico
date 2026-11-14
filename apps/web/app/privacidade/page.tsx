import { pageMeta } from "@/lib/seo";
import { Callout, ContentPage } from "@/components/ContentPage";
import { DataInventory, NeverList, ProviderList, RightsGrid, Steps, SummaryTiles, UpdatedAt } from "@/components/Legal";

export const metadata = pageMeta({ title: "Privacidade", path: "/privacidade", description: "Política de privacidade do Domínio Político: que dados guardamos, para quê, por quanto tempo e como apagar sua conta e todos os seus dados (LGPD)." });

export default function Page() {
  return (
    <ContentPage
      kicker="LGPD · Lei 13.709/2018"
      title="Política de Privacidade"
      lede="Coletamos o mínimo necessário para você jogar, e nada que revele a sua posição política real."
      heroExtra={
        <>
          <SummaryTiles
            items={[
              { icon: "mail", title: "Só e-mail e senha", text: "Nenhum documento, telefone ou endereço." },
              { icon: "user", title: "Personagem ≠ você", text: "A ideologia do personagem é ficção, não opinião sua." },
              { icon: "cookie", title: "Sem rastreadores", text: "Apenas o cookie de sessão necessário para o login. As visitas são contadas sem cookies e sem identificar você." },
              { icon: "download", title: "Controle total", text: "Exporte ou apague seus dados quando quiser." },
            ]}
          />
          <UpdatedAt date="13/11/2026" version="1.2" />
        </>
      }
      sections={[
        {
          id: "coletamos",
          title: "O que coletamos e por quê",
          icon: "database",
          body: (
            <DataInventory
              items={[
                {
                  icon: "mail",
                  what: "Conta de acesso",
                  examples: "E-mail, senha (guardada só como hash), data do aceite dos termos e confirmação de idade",
                  why: "Identificar você e proteger o acesso ao seu personagem",
                  basis: "Execução de contrato (art. 7º, V)",
                  keep: "Enquanto a conta existir",
                },
                {
                  icon: "flag",
                  what: "Dados do jogo",
                  examples: "Nome e atributos do personagem, ações, notificações e notícias privadas",
                  why: "Fazer a simulação funcionar e mostrar o seu histórico",
                  basis: "Execução de contrato (art. 7º, V)",
                  keep: "Enquanto a conta existir; depois, anonimizados",
                },
                {
                  icon: "coins",
                  what: "Assinatura e pagamentos",
                  examples: "Até quando a assinatura vale e, de cada Pix, o número no Mercado Pago, o valor, a situação e as datas. O e-mail da conta vai ao Mercado Pago para gerar o Pix",
                  why: "Liberar o acesso pago, conferir os pagamentos e fazer devoluções",
                  basis: "Execução de contrato (art. 7º, V) e cumprimento de obrigação legal (art. 7º, II)",
                  keep: "A assinatura, enquanto a conta existir; os pagamentos, sem vínculo com a conta depois de apagada",
                },
                {
                  icon: "sparkle",
                  what: "Sugestões para o jogo",
                  examples: "Título, texto, até 3 fotos e o nome que você escolhe para os créditos",
                  why: "Melhorar o jogo e dar crédito a quem sugeriu (o nome e o título aparecem para todos se a sugestão virar atualização)",
                  basis: "Consentimento (art. 7º, I): você manda se quiser",
                  keep: "Enquanto a conta existir; as fotos são apagadas junto com a conta",
                },
                {
                  icon: "cookie",
                  what: "Cookie de sessão",
                  examples: "Token de autenticação do Supabase e, para quem assina, um cookie com a data até quando a assinatura vale",
                  why: "Manter você conectado entre páginas",
                  basis: "Estritamente necessário ao serviço",
                  keep: "Até sair ou o token expirar",
                },
              ]}
            />
          ),
        },
        {
          id: "nao-coletamos",
          title: "O que nunca pedimos",
          icon: "shield",
          body: (
            <>
              <NeverList items={["CPF ou RG", "Título de eleitor", "Endereço", "Telefone", "Filiação partidária real", "Voto ou opinião política"]} />
              <Callout tone="real" title="Seu personagem é ficção">
                As posições escolhidas para o personagem fazem parte do jogo e não são tratadas como dado sensível seu (art. 5º, II). O vínculo entre a sua conta e o seu
                personagem não é exibido publicamente.
              </Callout>
            </>
          ),
        },
        {
          id: "direitos",
          title: "Seus direitos",
          icon: "key",
          body: (
            <RightsGrid
              items={[
                { icon: "search", title: "Acesso e portabilidade", text: "Baixe tudo o que temos sobre você em um arquivo JSON.", href: "/api/meus-dados", cta: "Exportar meus dados" },
                { icon: "trash", title: "Eliminação", text: "Apague a conta e os dados pessoais. O personagem sai do mundo de forma neutra.", href: "/conta", cta: "Ir para Minha conta" },
                { icon: "info", title: "Informação", text: "Saiba com quem os dados são compartilhados: só os operadores listados abaixo." },
                { icon: "x", title: "Revogação", text: "Você pode deixar de jogar a qualquer momento, sem multa ou retenção." },
              ]}
            />
          ),
        },
        {
          id: "exclusao",
          title: "O que acontece quando você exclui a conta",
          icon: "trash",
          body: (
            <Steps
              items={[
                { title: "Personagem aposentado", text: "Ele recebe o nome “Personagem removido” e sai da política sem nenhum evento negativo." },
                { title: "Dados privados apagados", text: "Notificações, notícias privadas, dossiês e ofertas são excluídos." },
                { title: "Vínculo desfeito", text: "A ligação entre a conta e o personagem é apagada." },
                { title: "Conta de acesso removida", text: "Seu e-mail e a senha deixam de existir no provedor de autenticação." },
              ]}
            />
          ),
        },
        {
          id: "operadores",
          title: "Quem processa os dados",
          icon: "globe",
          body: (
            <>
              <ProviderList
                items={[
                  { name: "Supabase", role: "Banco e autenticação", detail: "Guarda a conta e o estado dos mundos, com controle de acesso por linha em todas as tabelas." },
                  { name: "Vercel", role: "Hospedagem e métricas", detail: "Serve o site e executa o motor da simulação, com funções na região de São Paulo. Conta visitas por página de forma agregada, sem cookies e sem identificar o visitante (Web Analytics)." },
                  { name: "Resend", role: "E-mail", detail: "Envia os e-mails de confirmação, recuperação de senha e avisos da conta." },
                  { name: "Mercado Pago", role: "Pagamentos", detail: "Processa o Pix da assinatura. Recebe o e-mail da conta e o valor; os dados bancários de quem paga ficam com o Mercado Pago e não chegam ao jogo." },
                  { name: "Cloudflare", role: "Anti-robô", detail: "Verifica, no cadastro e na entrada, se a visita é de uma pessoa (Turnstile), sem guardar seus dados de acesso." },
                ]}
              />
              <Callout tone="info" title="Transferência internacional">
                Esses operadores podem tratar dados fora do Brasil, observada a Resolução CD/ANPD nº 19/2024. Em caso de incidente de segurança relevante, a ANPD e os
                titulares afetados serão comunicados.
              </Callout>
            </>
          ),
        },
      ]}
    />
  );
}
