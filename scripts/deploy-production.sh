#!/usr/bin/env bash
# =============================================================================
# VPS LATAM Cloud — Production Deploy Script
# Probado en: Ubuntu 22.04 LTS (Hetzner CPX21, Contabo VPS S)
# Uso: sudo bash deploy-production.sh
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

log()  { echo -e "${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }
die()  { echo -e "${RED}✗ $*${RESET}"; exit 1; }

# ── Check root ────────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root: sudo bash $0"

# ── Load .env ─────────────────────────────────────────────────────────────────
ENV_FILE="/opt/vpslatam/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  die ".env not found at $ENV_FILE — copy .env.example and fill in the values"
fi
set -a; source "$ENV_FILE"; set +a
log "Loaded .env from $ENV_FILE"

# ── Validate required vars ────────────────────────────────────────────────────
REQUIRED_VARS=(
  BASE_DOMAIN ACME_EMAIL
  POSTGRES_PASSWORD JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET GITHUB_WEBHOOK_SECRET
  TRAEFIK_DASHBOARD_AUTH
)
for v in "${REQUIRED_VARS[@]}"; do
  [[ -n "${!v:-}" ]] || die "Missing required env var: $v"
done

# ── Install Docker + Compose ──────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
  ok "Docker installed"
else
  ok "Docker already installed"
fi

if ! docker compose version &>/dev/null; then
  log "Installing Docker Compose plugin..."
  apt-get install -y docker-compose-plugin
fi

# ── Install Git ───────────────────────────────────────────────────────────────
apt-get install -y git curl wget htop logrotate 2>/dev/null
ok "System packages ready"

# ── Create directories ────────────────────────────────────────────────────────
log "Creating directories..."
mkdir -p /opt/vpslatam
mkdir -p /var/vpslatam/{builds,logs}
mkdir -p /var/log/vpslatam
chmod 700 /var/vpslatam

# ── Create traefik-net (external network for user containers) ─────────────────
if ! docker network inspect traefik-net &>/dev/null; then
  docker network create traefik-net
  ok "Created traefik-net network"
else
  ok "traefik-net already exists"
fi

# ── Clone/update repo ─────────────────────────────────────────────────────────
REPO_DIR="/opt/vpslatam/app"
if [[ -d "$REPO_DIR/.git" ]]; then
  log "Updating existing repo..."
  cd "$REPO_DIR" && git pull --rebase
else
  log "Cloning repository..."
  [[ -n "${REPO_URL:-}" ]] || die "REPO_URL not set in .env"
  git clone "$REPO_URL" "$REPO_DIR"
  cd "$REPO_DIR"
fi

# ── Copy .env ─────────────────────────────────────────────────────────────────
cp "$ENV_FILE" "$REPO_DIR/.env"
ok "Copied .env"

# ── Setup logrotate ───────────────────────────────────────────────────────────
cat > /etc/logrotate.d/vpslatam <<'EOF'
/var/vpslatam/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
ok "logrotate configured"

# ── Setup ufw firewall ────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
  log "Configuring UFW..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow ssh
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
  ok "UFW configured"
fi

# ── Deploy with Docker Compose ────────────────────────────────────────────────
cd "$REPO_DIR"
log "Building and starting services..."
docker compose pull 2>/dev/null || true
docker compose build --no-cache
docker compose up -d --remove-orphans

ok "Services started"

# ── Wait for API health ───────────────────────────────────────────────────────
log "Waiting for API to be healthy..."
MAX_WAIT=90
WAITED=0
until curl -sf "http://localhost:4000/health" &>/dev/null; do
  sleep 3
  WAITED=$((WAITED + 3))
  [[ $WAITED -ge $MAX_WAIT ]] && { warn "API didn't come up in ${MAX_WAIT}s — check: docker compose logs api"; break; }
done

if curl -sf "http://localhost:4000/health" &>/dev/null; then
  ok "API is healthy!"
fi

# ── Setup auto-update cron ────────────────────────────────────────────────────
CRON_JOB="0 4 * * * cd $REPO_DIR && git pull --rebase && docker compose up -d --build >> /var/log/vpslatam/auto-update.log 2>&1"
(crontab -l 2>/dev/null | grep -v "vpslatam"; echo "$CRON_JOB") | crontab -
ok "Auto-update cron set (daily at 4am)"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}════════════════════════════════════════${RESET}"
echo -e "${BOLD}  🚀 VPS LATAM Cloud desplegado${RESET}"
echo -e "${BOLD}${GREEN}════════════════════════════════════════${RESET}"
echo ""
echo -e "  🌐 Frontend:  https://${BASE_DOMAIN}"
echo -e "  🔌 API:       https://api.${BASE_DOMAIN}"
echo -e "  📊 Traefik:   https://traefik.${BASE_DOMAIN}"
echo -e "  🗄️  DB:        postgresql (interno)"
echo ""
echo -e "  ${YELLOW}Próximos pasos:${RESET}"
echo -e "  1. Apunta *.${BASE_DOMAIN} a esta IP en tu DNS"
echo -e "  2. Crea el primer usuario en el dashboard"
echo -e "  3. Conecta GitHub y haz tu primer deploy"
echo ""
echo -e "  ${CYAN}Logs:  docker compose logs -f api${RESET}"
echo ""
