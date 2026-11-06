#!/usr/bin/env bash
# Publica a versão nova do GitHub (main), como a Vercel fazia: roda a cada 2 minutos (timer) e só
# trabalha quando há commit novo. Monta cada versão numa pasta própria e só troca quando o build
# terminou, então o jogo continua no ar durante a compilação. Guarda as 2 últimas versões.
# Um commit cujo build falhou não é tentado de novo sozinho: espera o próximo commit (ou --forcar).
#   dominio-politico-atualizar            publica se houver commit novo
#   dominio-politico-atualizar --forcar   recompila a versão atual
set -euo pipefail

BASE=/srv/dominio-politico
ENVF=/etc/dominio-politico.env
APPUSER=jogo
LOCK=/run/dominio-politico-atualizar.lock
FALHOU="$BASE/.falhou"

exec 9>"$LOCK"
flock -n 9 || exit 0   # outra atualização em andamento

as() { runuser -u "$APPUSER" -- "$@"; }

as git -C "$BASE/repo" fetch --quiet origin main
SHA=$(as git -C "$BASE/repo" rev-parse --short=12 origin/main)
CUR=$(readlink -f "$BASE/current" 2>/dev/null || true)
NO_AR=$(cat "$CUR/.versao" 2>/dev/null || true)

if [ "${1:-}" != "--forcar" ]; then
  if [ "$NO_AR" = "$SHA" ] && [ -f "$CUR/apps/web/.next/BUILD_ID" ]; then exit 0; fi
  if [ "$(cat "$FALHOU" 2>/dev/null || true)" = "$SHA" ]; then exit 0; fi
fi

# pasta nova a cada build: a versão no ar nunca é apagada enquanto roda
REL="$BASE/releases/$SHA-$(date -u +%Y%m%d-%H%M%S)-$$"

construir() {
  as mkdir -p "$REL" &&
    as bash -c "set -o pipefail; git -C '$BASE/repo' archive origin/main | tar -x -C '$REL'" &&
    # aproveita o cache de compilação da versão no ar (o build fica bem mais rápido)
    { [ ! -d "$CUR/apps/web/.next/cache" ] || { as mkdir -p "$REL/apps/web/.next" && as cp -a "$CUR/apps/web/.next/cache" "$REL/apps/web/.next/"; } || true; } &&
    # o build pode usar mais memória que o jogo (o swap segura em máquinas pequenas)
    as bash -c "set -a; . '$ENVF'; set +a; export APP_BUILD='$SHA' NODE_OPTIONS=--max-old-space-size=3072; cd '$REL' && npm ci --include=dev --no-audit --no-fund --loglevel=error && npm run build" &&
    echo "$SHA" | as tee "$REL/.versao" >/dev/null
}

echo "Publicando $SHA..."
if ! construir; then
  echo "$SHA" > "$FALHOU"
  rm -rf "$REL"
  echo "Falhou a publicação de $SHA (o erro está acima). Continua no ar a versão anterior."
  exit 1
fi

ln -sfn "$REL" "$BASE/current"
systemctl restart dominio-politico
rm -f "$FALHOU"
echo "No ar: $SHA"

# limpa versões antigas (fica a atual e a anterior, para voltar rápido se precisar)
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +3 | while read -r d; do
  [ "$(readlink -f "$d")" = "$REL" ] || rm -rf "$d"
done || true
