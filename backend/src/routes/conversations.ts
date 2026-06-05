import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { hashIp, clientIp } from '../lib/crypto.js';
import { anonAuth } from '../middleware/anonAuth.js';
import { notifyNewActivity } from '../services/notify.js';
import { bus, emitLead, emitClientMessage, type MessageEvent } from '../services/bus.js';
import { openSseStream } from '../lib/sse.js';

export const conversationsRouter = Router();

// --- схемы валидации ---
const createConversationSchema = z.object({
  clientName: z.string().trim().max(120).optional(),
  contact: z.string().trim().min(2, 'contact обязателен').max(200),
  contactType: z.enum(['EMAIL', 'TELEGRAM', 'PHONE', 'OTHER']).default('EMAIL'),
  budget: z.string().trim().max(120).optional(),
  stack: z.string().trim().max(200).optional(),
  ideaSummary: z.string().trim().max(4000).optional(),
});

const createMessageSchema = z.object({
  body: z.string().trim().min(1, 'пустое сообщение').max(8000),
  attachmentIds: z.array(z.string().cuid()).max(10).optional(),
});

/**
 * POST /api/conversations
 * Создаёт диалог (лид) из формы-визитки. Возвращает { conversationId, anonToken }.
 */
conversationsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', issues: parsed.error.flatten() });
      return;
    }

    const conversation = await prisma.conversation.create({
      data: {
        ...parsed.data,
        ipHash: hashIp(clientIp(req)),
        userAgent: req.header('User-Agent')?.slice(0, 500),
      },
    });

    // fire-and-forget: не задерживаем ответ
    void notifyNewActivity(conversation, null);
    emitLead(conversation);

    res.status(201).json({
      conversationId: conversation.id,
      anonToken: conversation.anonToken,
    });
  }),
);

/**
 * GET /api/conversations/:id/messages
 * Клиент читает свою переписку (по X-Anon-Token). Отдаёт сообщения + вложения.
 */
conversationsRouter.get(
  '/:id/messages',
  anonAuth,
  asyncHandler(async (req, res) => {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.conversation!.id },
      orderBy: { createdAt: 'asc' },
      include: { attachments: true },
    });
    res.json({ messages });
  }),
);

/**
 * POST /api/conversations/:id/messages
 * Клиент шлёт сообщение (по X-Anon-Token). Обновляет lastMessageAt. Триггерит уведомление.
 */
conversationsRouter.post(
  '/:id/messages',
  anonAuth,
  asyncHandler(async (req, res) => {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation', issues: parsed.error.flatten() });
      return;
    }
    const conv = req.conversation!;
    const { body, attachmentIds } = parsed.data;

    // создаём сообщение + привязываем уже загруженные вложения этого диалога,
    // ещё не прикреплённые к сообщению; обновляем lastMessageAt — в одной транзакции
    const message = await prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: { conversationId: conv.id, sender: 'CLIENT', body },
      });

      if (attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: {
            id: { in: attachmentIds },
            conversationId: conv.id,
            messageId: null,
          },
          data: { messageId: msg.id },
        });
      }

      await tx.conversation.update({
        where: { id: conv.id },
        data: { lastMessageAt: new Date() },
      });

      return tx.message.findUniqueOrThrow({
        where: { id: msg.id },
        include: { attachments: true },
      });
    });

    void notifyNewActivity(conv, message);
    emitClientMessage(conv.id, message);

    res.status(201).json({ message });
  }),
);

/**
 * GET /api/conversations/:id/stream  (SSE)
 * Поток новых ADMIN-сообщений для клиента.
 * EventSource не умеет заголовки → токен передаётся как ?token=.
 */
conversationsRouter.get(
  '/:id/stream',
  asyncHandler(async (req, res) => {
    const token = String(req.query.token ?? '');
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conv || !token || conv.anonToken !== token) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const { send, onClose } = openSseStream(req, res);
    send('ready', { conversationId: conv.id });

    const onAdminMessage = (e: MessageEvent) => {
      if (e.conversationId === conv.id) send('message', e.message);
    };
    bus.on('admin-message', onAdminMessage);
    onClose(() => bus.off('admin-message', onAdminMessage));
  }),
);
