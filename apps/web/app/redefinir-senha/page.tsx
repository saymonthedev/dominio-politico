import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import { ResetPasswordForm } from "@/components/AuthForms";
import { FormMessage } from "@/components/forms";
import { Footer, PublicHeader } from "@/components/SiteChrome";
import { getSession } from "@/lib/game";

export const metadata: Metadata = { title: "Criar senha nova" };

export default async function Page() {
  const { user } = await getSession();
  return (
    <>
      <PublicHeader loggedIn={!!user} />
      <AuthShell
        title="Criar senha nova"
        sub={user ? "Escolha a senha nova da sua conta. Depois disso, a antiga deixa de valer." : "Para criar uma senha nova, abra o link que enviamos por e-mail."}
        aside={{ title: <>Seu personagem <em>continua lá</em>.</>, text: "O mundo seguiu andando, mas sua carreira, seu partido e seu dinheiro estão guardados." }}
        footer={
          <>
            Link vencido? <a href="/esqueci-senha">Pedir outro</a>
          </>
        }
      >
        {user ? (
          <ResetPasswordForm />
        ) : (
          <FormMessage tone="info">
            Este endereço só funciona a partir do link de recuperação, e ele vale por tempo limitado. <a href="/esqueci-senha">Peça um link novo</a>.
          </FormMessage>
        )}
      </AuthShell>
      <Footer />
    </>
  );
}
