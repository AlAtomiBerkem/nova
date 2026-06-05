import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  signAdminToken,
  setAuthCookie,
  clearAuthCookie,
} from '../lib/auth.js';
import { bus, emitAdminMessage, type LeadEvent, type MessageEvent } from '../services/bus.js';
import { openSseStream } from '../lib/sse.js';
import { env } from '../lib/env.js';

export const adminRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/** POST /api/admin/login → ставит httpOnly-cookie с JWT. */
adminRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation' });
      return;
    }
    const { email, password } = parsed.data;

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    // постоянное по времени поведение: всегда сверяем bcrypt, даже если юзера нет
    const hash = admin?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password, hash);

    if (!admin || !ok) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }

    const token = signAdminToken({ sub: admin.id, email: admin.email });
    setAuthCookie(res, token);
    res.json({ admin: { id: admin.id, email: admin.email, displayName: admin.displayName } });
  }),
);

/** POST /api/admin/logout */
adminRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

/** GET /api/admin/me — текущий админ (для проверки сессии фронтом). */
adminRouter.get('/me', adminAuth, (req, res) => {
  res.json({ admin: req.admin });
});

// ↓↓↓ всё ниже — только авторизованному админу
adminRouter.use(adminAuth);

/** GET /api/admin/conversations?status= → список лидов, свежие сверху. */
adminRouter.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const status = req.query.status as string | undefined;
    const where =
      status && ['NEW', 'IN_PROGRESS', 'CLOSED'].includes(status)
        ? { status: status as 'NEW' | 'IN_PROGRESS' | 'CLOSED' }
        : {};

    const conversations = await prisma.conversation.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
      omit: { anonToken: true, ipHash: true }, // клиентский ключ доступа админке не нужен
      include: {
        _count: { select: { messages: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }, // превью последнего
      },
    });
    res.json({ conversations });
  }),
);

/** GET /api/admin/conversations/:id → визитка + сообщения + вложения. */
adminRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      omit: { anonToken: true, ipHash: true },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, include: { attachments: true } },
        attachments: true,
      },
    });
    if (!conversation) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    // помечаем клиентские сообщения прочитанными
    await prisma.message.updateMany({
      where: { conversationId: conversation.id, sender: 'CLIENT', readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ conversation });
  }),
);

const adminMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
});

/** POST /api/admin/conversations/:id/messages → ответ админа (sender=ADMIN). */
adminRouter.post(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const parsed = adminMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation' });
      return;
    }
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conv) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { conversationId: conv.id, sender: 'ADMIN', body: parsed.data.body },
      });
      await tx.conversation.update({
        where: { id: conv.id },
        // первый ответ автоматически переводит лид в работу
        data: {
          lastMessageAt: new Date(),
          status: conv.status === 'NEW' ? 'IN_PROGRESS' : conv.status,
        },
      });
      return msg;
    });

    emitAdminMessage(conv.id, message);
    res.status(201).json({ message });
  }),
);

/**
 * GET /api/admin/stream  (SSE)
 * Поток новых лидов и клиентских сообщений в реальном времени.
 * Авторизация — по httpOnly-cookie (adminAuth уже применён выше).
 */
adminRouter.get('/stream', (req, res) => {
  const { send, onClose } = openSseStream(req, res);
  send('ready', { ok: true });

  const onLead = (e: LeadEvent) => {
    const { anonToken: _t, ipHash: _h, ...safe } = e.conversation;
    send('lead', safe);
  };
  const onClientMessage = (e: MessageEvent) =>
    send('message', { conversationId: e.conversationId, message: e.message });

  bus.on('lead', onLead);
  bus.on('client-message', onClientMessage);
  onClose(() => {
    bus.off('lead', onLead);
    bus.off('client-message', onClientMessage);
  });
});

/** GET /api/admin/push/vapid → публичный VAPID-ключ для подписки в браузере. */
adminRouter.get('/push/vapid', (_req, res) => {
  res.json({ publicKey: env.vapid.publicKey || null });
});

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

/** POST /api/admin/push/subscribe → сохранить PushSubscription текущего админа. */
adminRouter.post(
  '/push/subscribe',
  asyncHandler(async (req, res) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation' });
      return;
    }
    const { endpoint, keys } = parsed.data;
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, adminId: req.admin!.sub },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, adminId: req.admin!.sub },
    });
    res.status(201).json({ ok: true });
  }),
);

const patchSchema = z.object({
  status: z.enum(['NEW', 'IN_PROGRESS', 'CLOSED']),
});

/** PATCH /api/admin/conversations/:id → смена статуса. */
adminRouter.patch(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation' });
      return;
    }
    const { status } = parsed.data;
    const conversation = await prisma.conversation.update({
      where: { id: req.params.id },
      data: { status, closedAt: status === 'CLOSED' ? new Date() : null },
    });
    res.json({ conversation });
  }),
);
