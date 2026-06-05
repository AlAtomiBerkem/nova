import type { Conversation, Message } from '@prisma/client';

/**
 * Единая точка уведомлений о новой активности (новый лид / новое сообщение клиента).
 * Этап 7 наполнит её каналами: Telegram → web-push → email.
 * Пока — лог, чтобы видеть срабатывание и не блокировать остальную логику.
 *
 * Важно: вызывать без await в обработчиках (fire-and-forget), чтобы отправка
 * уведомления не задерживала ответ клиенту. Ошибки глушим здесь.
 */
export async function notifyNewActivity(
  conversation: Conversation,
  message: Message | null,
): Promise<void> {
  try {
    const kind = message ? 'новое сообщение' : 'новый лид';
    console.log(
      `[notify] ${kind}: conv=${conversation.id} contact=${conversation.contact}` +
        (message ? ` body="${message.body.slice(0, 60)}"` : ''),
    );
    // TODO(Этап 7): Telegram, web-push, email
  } catch (err) {
    console.error('[notify] ошибка отправки уведомления:', err);
  }
}
