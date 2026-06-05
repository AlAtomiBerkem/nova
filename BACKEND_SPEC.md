# NOVA — ТЗ бэкенда чата (Node + Express + Prisma + PostgreSQL)

Схема БД — в `schema.prisma`. Ниже — какие эндпоинты и логику собрать вокруг неё.
Идём по шагам сверху вниз.

## Стек
- Node + Express (или Fastify), TypeScript
- Prisma + PostgreSQL
- Файлы: S3/Cloudflare R2 (на старте — локальная папка `/uploads`, в БД только путь)
- Авторизация админки: JWT в httpOnly-cookie, пароль через bcrypt
- Realtime-ощущение: SSE (Server-Sent Events)
- Уведомления: Telegram-бот (первым), web-push, email (Resend/Nodemailer)

---

## Публичное API (клиент, без авторизации)

### POST /api/conversations
Создаёт диалог (лид) из формы-визитки. Возвращает `{ conversationId, anonToken }`.
Тело: `{ clientName?, contact, contactType, budget?, stack?, ideaSummary? }`.
- `contact` обязателен — валидировать.
- Сохранить ipHash (хеш IP) и userAgent.
- Триггерит уведомление «новый лид» (см. ниже).

### POST /api/conversations/:id/messages
Клиент шлёт сообщение. Авторизация — по заголовку `X-Anon-Token`, сверяем с conversation.anonToken.
Тело: `{ body, attachmentIds? }`. Обновляет `lastMessageAt`. Триггерит уведомление.

### GET /api/conversations/:id/messages
Клиент читает свою переписку. Тоже по `X-Anon-Token`. Отдаёт сообщения + вложения.

### GET /api/conversations/:id/stream  (SSE)
Поток новых сообщений для клиента (по anonToken). Сервер пушит событие при новом ADMIN-сообщении.

### POST /api/uploads
Загрузка креатива. multipart/form-data. ЛИМИТЫ:
- размер ≤ 10 МБ
- mime только: image/png, image/jpeg, image/webp, application/pdf
Возвращает `{ attachmentId, url }`.

---

## Админское API (только ты, JWT обязателен)

### POST /api/admin/login  →  { token }  (в httpOnly-cookie)
### GET  /api/admin/conversations?status=  →  список лидов, сортировка по lastMessageAt desc
### GET  /api/admin/conversations/:id      →  визитка + все сообщения + вложения
### POST /api/admin/conversations/:id/messages  →  твой ответ (sender=ADMIN)
### PATCH /api/admin/conversations/:id     →  смена статуса (NEW→IN_PROGRESS→CLOSED)
### GET  /api/admin/stream  (SSE)          →  поток новых лидов/сообщений в реальном времени
### POST /api/admin/push/subscribe         →  сохранить PushSubscription

---

## Уведомления о новом лиде / сообщении
Вызывать из одного места (функция `notifyNewActivity(conversation, message)`):
1. **Telegram** — бот шлёт тебе в личку: имя, контакт, бюджет, превью идеи + ссылка на диалог в админке. (Самый быстрый канал — делать первым.)
2. **web-push** — по всем PushSubscription. Работает с закрытой вкладкой (нужен Service Worker на фронте админки).
3. **email** — резервно.

---

## Антиспам (обязательно — чат открыт всем)
- Rate-limit: не более N сообщений в минуту с одного ipHash.
- Капча на ПЕРВОЕ сообщение (лёгкая — hCaptcha/Turnstile, чтобы не отпугнуть).
- Лимит вложений (см. /api/uploads).

## Порядок реализации
1. `schema.prisma` → migrate → generate.
2. Публичные эндпоинты диалога и сообщений (CRUD, без realtime).
3. Загрузка файлов с лимитами.
4. Админ: login + список + диалог + ответ.
5. SSE (сначала админский поток, потом клиентский).
6. Уведомления: Telegram → web-push → email.
7. Антиспам в конце, перед публикацией.
