# NOVA

Фулстек-сайт студии разработки: лендинг + чат «клиент ↔ исполнитель» + админка.

- **Frontend** — статика (HTML/CSS/JS, three.js), раздаётся через Nginx.
- **Backend** — Node + Express + TypeScript, Prisma ORM, PostgreSQL.
- **Realtime** — SSE. **Уведомления** — Telegram → web-push → email.

## Структура

```
site/
├── docker-compose.yml      # postgres + backend + nginx
├── .env.example            # переменные окружения
├── backend/                # Express + TS + Prisma
│   ├── prisma/schema.prisma
│   └── src/
└── frontend/               # статика + Nginx (раздача + proxy /api)
    ├── nginx.conf
    └── public/             # index.html, chat-widget.html, admin.html, style-guide.html
```

## Запуск через Docker (прод-подобный)

```bash
cp .env.example .env        # затем заполни секреты (см. ниже)
docker compose up --build
```

Сайт: http://localhost:8080 · API: http://localhost:8080/api/health ·
Админка: http://localhost:8080/admin.html

На старте контейнер бэкенда сам применяет миграции (`prisma migrate deploy`)
и создаёт админа из `ADMIN_EMAIL`/`ADMIN_PASSWORD` (если заданы).

### Минимум секретов для старта
```bash
JWT_SECRET=$(openssl rand -hex 32)      # подпись JWT
IP_HASH_SALT=$(openssl rand -hex 16)    # соль для хеша IP
ADMIN_EMAIL=...                          # логин в админку
ADMIN_PASSWORD=...                       # пароль в админку
```

## Локальная разработка backend (без docker)

```bash
cd backend
cp ../.env.example .env      # пропиши DATABASE_URL на localhost:5432
docker compose up -d db      # поднять только Postgres
npm install
npm run prisma:migrate -- --name init
npm run dev                  # tsx watch, :4000
```

## Уведомления (опционально, каждый канал включается своим ключом)

- **Telegram** — `TELEGRAM_BOT_TOKEN` (от @BotFather) + `TELEGRAM_CHAT_ID` (от @userinfobot).
- **Web-push** — сгенерировать ключи: `cd backend && npx web-push generate-vapid-keys`,
  положить в `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`. В админке нажать 🔔 для подписки.
- **Email (резерв)** — `RESEND_API_KEY` + `RESEND_TO` (Resend).

Без ключей канал просто молчит — сервер работает штатно.

## Антиспам

- Rate-limit по хешу IP: `RATE_MAX` запросов за `RATE_WINDOW_MS` (по умолчанию 10/мин).
- Капча Cloudflare Turnstile: задать `TURNSTILE_SECRET` (бэкенд проверяет токен на
  создании лида). На фронте — вставить site key в форму-визитку `chat-widget.html`
  (виджет Turnstile + поле `captchaToken` в payload). Без секрета проверка пропускается.

## Этапы реализации

См. `BACKEND_SPEC.md`. Порядок: БД → публичное API → загрузки → админка → SSE →
подключение фронта → уведомления → антиспам → деплой.

## Деплой на сервер

1. Залить репозиторий на GitHub (см. ниже).
2. На сервере с Docker:
   ```bash
   git clone <repo> && cd site
   cp .env.example .env      # заполнить секреты
   docker compose up -d --build
   ```
3. Перед публичным доступом — домен + TLS. Проще всего поставить перед стеком
   reverse-proxy с авто-сертификатом (Caddy/Traefik) или nginx + certbot,
   проксируя 80/443 → сервис `web`.
4. Прод-замечания:
   - убрать публикацию порта `db` (`DB_PORT`) наружу;
   - выставить сильные `JWT_SECRET`, `IP_HASH_SALT`, пароль БД;
   - `CORS_ORIGINS`/`ADMIN_URL` — на реальный домен;
   - файлы-вложения сейчас в docker volume `uploads`; для масштабирования — вынести в S3/R2.
