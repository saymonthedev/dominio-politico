"use client";
import { useSyncExternalStore } from "react";

/**
 * Este navegador tem uma sessão salva? Lê só o cookie do login (a conferência de verdade é no
 * servidor, nas telas do jogo). Assim as páginas públicas saem prontas da CDN, sem consultar o
 * login a cada visita, e só o botão muda para quem já entrou.
 */
function hasSession(): boolean {
  return /(?:^|;\s*)sb-[a-z0-9]+-auth-token(?:\.0)?=/.test(document.cookie);
}

const noSubscribe = () => () => {};

export function useLoggedIn(): boolean {
  return useSyncExternalStore(noSubscribe, hasSession, () => false);
}

/** Link com destino (e texto, se quiser) próprio para quem já está logado. */
export function AuthLink({
  href,
  authHref,
  className,
  children,
  authChildren,
}: {
  href: string;
  authHref: string;
  className?: string;
  children: React.ReactNode;
  authChildren?: React.ReactNode;
}) {
  const loggedIn = useLoggedIn();
  return (
    <a className={className} href={loggedIn ? authHref : href}>
      {loggedIn && authChildren !== undefined ? authChildren : children}
    </a>
  );
}

/** Botões do cabeçalho público: entrar/criar conta para visitantes, jogar para quem já entrou. */
export function HeaderCta({ page }: { page?: "entrar" | "cadastro" }) {
  const loggedIn = useLoggedIn();
  if (loggedIn && !page) {
    return (
      <a className="btn gold small" href="/jogo">
        Jogar
      </a>
    );
  }
  if (page === "cadastro") {
    return (
      <a className="btn gold small" href="/entrar">
        Entrar
      </a>
    );
  }
  return (
    <>
      {page !== "entrar" && (
        <a className="link hide-sm" href="/entrar">
          Entrar
        </a>
      )}
      <a className="btn gold small" href="/cadastro">
        Criar conta
      </a>
    </>
  );
}

/** Item "Entrar" do menu do celular, só para quem não entrou. */
export function MobileEnter() {
  return useLoggedIn() ? null : <a href="/entrar">Entrar</a>;
}
