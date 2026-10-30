/** Erros típicos de versão misturada (aba aberta durante uma atualização do site). */
export const SKEW = /is not a function|ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Cannot find module|Failed to find Server Action/i;

const KEY = "dp:recarregou";

/** Recarrega uma vez (no máximo a cada 30 s) quando o erro parece de versão misturada. */
export function recoverOnce(error: unknown): void {
  const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (!SKEW.test(msg)) return;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  window.location.reload();
}

/**
 * Mesmo tratamento, em script puro, para rodar antes do React: erro dentro do
 * carregador de módulos do Next ("e[o] is not a function") ou script do site que não carregou.
 */
export const RECOVER_SCRIPT = `(function(){var k="${KEY}";function go(){try{var l=+(sessionStorage.getItem(k)||0);if(Date.now()-l<30000)return;sessionStorage.setItem(k,String(Date.now()));}catch(e){return;}location.reload();}
window.addEventListener("error",function(e){var t=e.target;if(t&&t!==window&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var u=t.src||t.href||"";if(u.indexOf("/_next/static/")>=0)go();return;}
var f=(e.filename||"")+"",m=(e.message||"")+"";if((f.indexOf("/chunks/webpack-")>=0&&/is not a function|Cannot read propert/.test(m))||/ChunkLoadError|Loading (CSS )?chunk/.test(m))go();},true);
window.addEventListener("unhandledrejection",function(e){var r=e.reason;if(r&&/ChunkLoadError|Loading (CSS )?chunk|dynamically imported module/.test(r.name+" "+r.message))go();});})();`;
