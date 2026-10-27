import { Callout, ContentPage } from "@/components/ContentPage";
import { DataInventory, NeverList, ProviderList, RightsGrid, Steps, SummaryTiles, UpdatedAt } from "@/components/Legal";

export const metadata = { title: "Privacidade" };

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
              { icon: "cookie", title: "Sem rastreadores", text: "Apenas o cookie de sessão necessário para o login." },
              { icon: "download", title: "Controle total", text: "Exporte ou apague seus dados quando quiser." },
            ]}
          />
          <UpdatedAt date="27/10/2026" version="1.1" />
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
                  icon: "cookie",
                  what: "Cookie de sessão",
                  examples: "Token de autenticação do Supabase",
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
                  { name: "Vercel", role: "Hospedagem", detail: "Serve o site e executa o motor da simulação, com funções na região de São Paulo." },
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
