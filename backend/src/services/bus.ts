import { EventEmitter } from 'node:events';
import type { Conversation, Message } from '@prisma/client';

/**
 * Внутрипроцессная шина событий для SSE.
 * Достаточно для одного инстанса бэкенда. При горизонтальном масштабировании
 * заменить на Redis pub/sub (интерфейс тот же).
 */
class Bus extends EventEmitter {}

export const bus = new Bus();
// много подписчиков (по одному на открытый SSE) — снимаем дефолтный лимит
bus.setMaxListeners(0);

// --- типы событий ---
export interface LeadEvent {
  conversation: Conversation;
}
export interface MessageEvent {
  conversationId: string;
  message: Message;
}

/** Новый лид (создан диалог) → админский поток. */
export function emitLead(conversation: Conversation): void {
  bus.emit('lead', { conversation } satisfies LeadEvent);
}

/** Сообщение клиента → админский поток. */
export function emitClientMessage(conversationId: string, message: Message): void {
  bus.emit('client-message', { conversationId, message } satisfies MessageEvent);
}

/** Ответ админа → клиентский поток конкретного диалога. */
export function emitAdminMessage(conversationId: string, message: Message): void {
  bus.emit('admin-message', { conversationId, message } satisfies MessageEvent);
}
