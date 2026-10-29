/**
 * E-mails do jogo fora do Supabase Auth (avisos), pela API da Resend.
 * Sem RESEND_API_KEY no ambiente, nada é enviado e a função devolve false.
 */
const FROM = process.env.MAIL_FROM ?? "Domínio Político <nao-responda@dominio-politico.com.br>";

export async function sendMail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return true;
}
