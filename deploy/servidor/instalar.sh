#!/usr/bin/env bash
# Instala o Domínio Político num servidor Ubuntu do zero (feito para a Oracle Cloud Always Free, ARM).
# Uso, no servidor:
#   curl -fsSL https://raw.githubusercontent.com/saymonthedev/dominio-politico/main/deploy/servidor/instalar.sh | sudo bash
# Pode rodar de novo sem medo: o que já existe é mantido (inclusive os segredos).
set -euo pipefail

REPO=https://github.com/saymonthedev/dominio-politico.git
BASE=/srv/dominio-politico
ENVF=/etc/dominio-politico.env
APPUSER=jogo

[ "$(id -u)" = 0 ] || { echo "Rode com sudo (veja o comando no topo do arquivo)."; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "==> 1/8 Pacotes do sistema"
apt-get update -y
apt-get install -y git curl ca-certificates build-essential gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent openssl

echo "==> 2/8 Memória extra para compilar (swap de 4 GB)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> 3/8 Node.js 22"
if ! command -v node >/dev/null || ! node -v | grep -q '^v22\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> 4/8 Caddy (HTTPS automático, certificado grátis)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> 5/8 Firewall: libera as portas 80 e 443 (a imagem da Oracle bloqueia tudo menos o SSH)"
for p in 80 443; do
  # antes da regra REJECT da imagem da Oracle (posição 5); em imagens com menos regras, no topo
  iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 5 -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$p" -j ACCEPT
done
netfilter-persistent save >/dev/null

echo "==> 6/8 Usuário do jogo e código"
id -u "$APPUSER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/$APPUSER --shell /usr/sbin/nologin "$APPUSER"
mkdir -p "$BASE/releases"
[ -d "$BASE/repo/.git" ] || git clone --quiet "$REPO" "$BASE/repo"
chown -R "$APPUSER:$APPUSER" "$BASE"

echo "==> 7/8 Configuração e segredos (ficam só neste servidor)"
if [ ! -f "$ENVF" ]; then
  SIM=$(openssl rand -hex 32)
  CRON=$(openssl rand -hex 24)
  RESEND=""
  if [ -r /dev/tty ]; then
    read -r -p "Chave da Resend para os e-mails de aviso (Enter para pular, dá para pôr depois): " RESEND < /dev/tty || true
  fi
  cat > "$ENVF" <<ENVEOF
# Domínio Político: configuração deste servidor (não vai para o GitHub)
NODE_ENV=production
NEXT_PUBLIC_SUPABASE_URL=https://hdiigrqhxtqasrdtleii.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ws2Jk5ZDvUcuemrbxmkwZw_vhPlgrWW
NEXT_PUBLIC_SITE_URL=https://dominio-politico.com.br
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x4AAAAAAFrV3vKoy_J1o3Fy
# caixa de doação por Pix ligada (fora da Vercel grátis, pode)
NEXT_PUBLIC_DONATIONS=1
ADMIN_USER_IDS=0d40241b-4d01-4967-b020-0dcc20edfd4e
WORLD_GAME_DAYS_PER_HOUR=2
# um servidor só, com bastante memória: os mundos ficam todos na memória
WORLD_CACHE_MAX=40
WORLD_CACHE_HEAP_MB=5000
SIM_SECRET=$SIM
CRON_SECRET=$CRON
RESEND_API_KEY=$RESEND
ENVEOF
  chmod 640 "$ENVF"
  chown "root:$APPUSER" "$ENVF"
fi

echo "==> 8/8 Serviços: jogo, atualização automática, tarefa diária e HTTPS"
install -m 755 "$BASE/repo/deploy/servidor/atualizar.sh" /usr/local/bin/dominio-politico-atualizar
cp "$BASE/repo/deploy/servidor/"*.service "$BASE/repo/deploy/servidor/"*.timer /etc/systemd/system/
cp "$BASE/repo/deploy/servidor/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
/usr/local/bin/dominio-politico-atualizar --forcar
systemctl enable --now dominio-politico.service dominio-politico-atualizar.timer dominio-politico-diario.timer
systemctl reload caddy || systemctl restart caddy

HASH=$(grep '^SIM_SECRET=' "$ENVF" | cut -d= -f2- | tr -d '\n' | sha256sum | cut -d' ' -f1)
IP=$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | cut -d' ' -f1)
cat <<FIM

============================================================
 Pronto! O jogo está rodando neste servidor.

 Mande estas duas linhas para o Claude:
   IP do servidor: $IP
   Código de conferência: $HASH

 (O código é só a impressão digital da chave do servidor;
  a chave mesmo fica guardada aqui e não sai daqui.)
============================================================
FIM
