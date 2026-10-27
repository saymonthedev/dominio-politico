import { ContentPage } from "@/components/ContentPage";

export const metadata = { title: "Privacidade" };

export default function Page() {
  return (
    <ContentPage title="Política de Privacidade" kicker="LGPD">
      <p>Coletamos o mínimo necessário (Lei 13.709/2018, princípio da necessidade):</p>
      <ul>
        <li><b>Conta:</b> e-mail e senha (armazenada com hash pelo provedor de autenticação).</li>
        <li><b>Jogo:</b> dados do seu personagem e das suas ações dentro da simulação.</li>
      </ul>
      <p>
        <b>Não</b> pedimos CPF, título de eleitor, endereço ou telefone. A ideologia escolhida para o personagem é parte da ficção e não é tratada como
        opinião política sua. O vínculo entre sua conta e seu personagem não é público.
      </p>
      <h2>Seus direitos</h2>
      <p>Você pode exportar seus dados e excluir sua conta na página <a href="/conta">Minha conta</a>.</p>
      <h2>Operadores</h2>
      <p>
        Hospedagem (Vercel) e banco de dados/autenticação (Supabase) podem envolver transferência internacional de dados, observada a Resolução CD/ANPD nº
        19/2024. Em caso de incidente de segurança relevante, comunicaremos a ANPD e os titulares conforme a regulamentação.
      </p>
    </ContentPage>
  );
}
