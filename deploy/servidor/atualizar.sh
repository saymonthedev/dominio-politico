#!/usr/bin/env bash
# Publica a versão nova do GitHub (main), como a Vercel fazia: roda a cada 2 minutos (timer) e só
# trabalha quando há commit novo. Monta cada versão numa pasta própria e só troca quando o build
# terminou, então o jogo continua no ar durante a compilação. Guarda as 2 últimas versões.
#   dominio-politico-atualizar            publica se houver commit novo
#   dominio-politico-atualizar --forcar   recompila a versão atual
set -euo pipefail

BASE=/srv/dominio-politico
ENVF=/etc/dominio-politico.env
APPUSER=jogo
LOCK=/run/dominio-politico-atualizar.lock

exec 9>"$LOCK"
flock -n 9 || exit 0   # outra atualização em andamento

as() { runuser -u "$APPUSER" -- "$@"; }

as git -C "$BASE/repo" fetch --quiet origin main
SHA=$(as git -C "$BASE/repo" rev-parse --short=12 origin/main)
REL="$BASE/releases/$SHA"
CUR=$(readlink -f "$BASE/current" 2>/dev/null || true)

if [ "$CUR" = "$REL" ] && [ -f "$REL/apps/web/.next/BUILD_ID" ] && [ "${1:-}" != "--forcar" ]; then
  exit 0
fi

echo "Publicando $SHA..."
rm -rf "$REL"
as mkdir -p "$REL"
as bash -c "git -C '$BASE/repo' archive origin/main | tar -x -C '$REL'"
as bash -c "set -a; . '$ENVF'; set +a; export APP_BUILD='$SHA'; cd '$REL' && npm ci --include=dev --no-audit --no-fund --loglevel=error && npm run build"

ln -sfn "$REL" "$BASE/current"
systemctl restart dominio-politico
echo "No ar: $SHA"

# limpa versões antigas (fica a atual e a anterior, para voltar rápido se precisar)
ls -1dt "$BASE"/releases/*/ 2>/dev/null | tail -n +3 | xargs -r rm -rf
