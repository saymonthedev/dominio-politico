/**
 * Caixa de doação por Pix ligada? Desligada por padrão: no plano grátis da Vercel (Hobby), pedir
 * doações conta como uso comercial, o que o plano não permite. Ligue com NEXT_PUBLIC_DONATIONS=1
 * quando o site estiver num plano ou servidor que permita (Vercel Pro ou hospedagem própria).
 */
export const DONATIONS = process.env.NEXT_PUBLIC_DONATIONS === "1";
