#!/usr/bin/env bash
# ============================================================
#  NOVA — первичная настройка прод-сервера (self-signed HTTPS по IP).
#  Запуск из корня репозитория:
#    PUBLIC_IP=1.2.3.4 ADMIN_EMAIL=you@mail.com ADMIN_PASSWORD=*** bash deploy/setup.sh
#  Идемпотентно: .env и сертификат не перезаписываются, если уже есть.
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PUBLIC_IP:?нужно задать PUBLIC_IP (внешний IP сервера)}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@nova.local}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 12)}"

rand() { openssl rand -hex "$1"; }

# --- .env ---
if [ ! -f .env ]; then
  echo "→ генерирую .env с крепкими секретами"
  cat > .env <<EOF
# Сгенерировано deploy/setup.sh — храни в секрете, не коммить.
POSTGRES_USER=nova
POSTGRES_PASSWORD=$(rand 16)
POSTGRES_DB=nova

JWT_SECRET=$(rand 32)
IP_HASH_SALT=$(rand 16)

CORS_ORIGINS=https://${PUBLIC_IP}
ADMIN_URL=https://${PUBLIC_IP}/admin.html

ADMIN_EMAIL=${ADMIN_EMAIL}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_NAME=NOVA

VAPID_SUBJECT=mailto:${ADMIN_EMAIL}

RATE_WINDOW_MS=60000
RATE_MAX=10
EOF
  echo "→ admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
  echo "  (пароль сохранён в .env, запиши его)"

  # VAPID для web-push (генерим через временный контейнер node)
  echo "→ генерирую VAPID-ключи"
  VAPID=$(docker run --rm node:22-slim sh -c "npm i -g web-push >/dev/null 2>&1 && web-push generate-vapid-keys --json")
  PUB=$(echo "$VAPID" | sed -n 's/.*"publicKey":"\([^"]*\)".*/\1/p')
  PRIV=$(echo "$VAPID" | sed -n 's/.*"privateKey":"\([^"]*\)".*/\1/p')
  { echo "VAPID_PUBLIC_KEY=${PUB}"; echo "VAPID_PRIVATE_KEY=${PRIV}"; } >> .env
else
  echo "→ .env уже есть, пропускаю"
fi

# --- self-signed сертификат на IP ---
mkdir -p deploy/certs
if [ ! -f deploy/certs/fullchain.pem ]; then
  echo "→ генерирую self-signed сертификат для IP ${PUBLIC_IP} (10 лет)"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout deploy/certs/privkey.pem \
    -out deploy/certs/fullchain.pem \
    -days 3650 \
    -subj "/CN=${PUBLIC_IP}" \
    -addext "subjectAltName=IP:${PUBLIC_IP}"
else
  echo "→ сертификат уже есть, пропускаю"
fi

# --- запуск ---
echo "→ поднимаю прод-стек"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

echo
echo "✅ Готово. Открой https://${PUBLIC_IP}  (браузер 1 раз предупредит про self-signed — это ок)"
echo "   Админка: https://${PUBLIC_IP}/admin.html"
