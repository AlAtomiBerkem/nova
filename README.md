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
cp .env.example .env        # затем заполни JWT_SECRET и пароли
docker compose up --build
```

Сайт: http://localhost:8080 · API: http://localhost:8080/api/health

## Локальная разработка backend (без docker)

```bash
cd backend
cp ../.env.example .env      # пропиши DATABASE_URL на localhost:5432
docker compose up -d db      # поднять только Postgres
npm install
npm run prisma:migrate -- --name init
npm run dev                  # tsx watch, :4000
```

## Этапы реализации

См. `BACKEND_SPEC.md`. Порядок: БД → публичное API → загрузки → админка → SSE →
подключение фронта → уведомления → антиспам → деплой.

## Деплой

1. Залить репозиторий на GitHub.
2. На сервере: `git pull`, заполнить `.env`, `docker compose up -d --build`.
3. Перед публичным доступом — поставить домен + TLS (Caddy/Traefik или nginx + certbot).
