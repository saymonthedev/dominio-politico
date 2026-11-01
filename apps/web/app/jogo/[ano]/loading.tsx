/**
 * Enquanto a próxima tela do jogo é montada no servidor, o esqueleto aparece na hora
 * (a barra lateral e o topo continuam no lugar): o clique responde imediatamente.
 */
export default function Loading() {
  return (
    <div className="gskel" role="status" aria-live="polite">
      <span className="sr-only">Carregando a tela…</span>
      <div className="gskel__head" aria-hidden="true">
        <i className="gskel__bar gskel__bar--kicker" />
        <i className="gskel__bar gskel__bar--title" />
        <i className="gskel__bar gskel__bar--lede" />
      </div>
      <div className="gskel__grid" aria-hidden="true">
        {[0, 1, 2].map((n) => (
          <div key={n} className="gskel__panel">
            <i className="gskel__bar gskel__bar--h" />
            <i className="gskel__bar" />
            <i className="gskel__bar gskel__bar--short" />
            <i className="gskel__bar" />
          </div>
        ))}
      </div>
    </div>
  );
}
