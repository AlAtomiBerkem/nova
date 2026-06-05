import webpush from 'web-push';
import type { Conversation, Message } from '@prisma/client';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

// настраиваем VAPID один раз при старте, если ключи заданы
const pushEnabled = Boolean(env.vapid.publicKey && env.vapid.privateKey);
if (pushEnabled) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
}

const telegramEnabled = Boolean(env.telegram.botToken && env.telegram.chatId);
const emailEnabled = Boolean(env.resend.apiKey && env.resend.to);

/** Человекочитаемый текст уведомления. */
function buildText(conversation: Conversation, message: Message | null): string {
  const kind = message ? '💬 Новое сообщение' : '🔔 Новый лид';
  const lines = [
    kind,
    `Контакт: ${conversation.contact} (${conversation.contactType})`,
  ];
  if (conversation.clientName) lines.push(`Имя: ${conversation.clientName}`);
  if (conversation.budget) lines.push(`Бюджет: ${conversation.budget}`);
  if (!message && conversation.ideaSummary)
    lines.push(`Идея: ${conversation.ideaSummary.slice(0, 200)}`);
  if (message) lines.push(`Текст: ${message.body.slice(0, 200)}`);
  lines.push(`Открыть: ${env.adminUrl}`);
  return lines.join('\n');
}

async function sendTelegram(text: string): Promise<void> {
  if (!telegramEnabled) return;
  const url = `https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: env.telegram.chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!r.ok) console.error('[notify] telegram:', r.status, await r.text());
}

async function sendWebPush(conversation: Conversation, message: Message | null): Promise<void> {
  if (!pushEnabled) return;
  const subs = await prisma.pushSubscription.findMany();
  if (!subs.length) return;

  const payload = JSON.stringify({
    title: message ? 'NOVA — новое сообщение' : 'NOVA — новый лид',
    body: `${conversation.contact}: ${(message?.body ?? conversation.ideaSummary ?? '').slice(0, 120)}`,
    url: env.adminUrl,
    conversationId: conversation.id,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        );
      } catch (err: unknown) {
        // 404/410 — подписка протухла, удаляем
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.error('[notify] web-push:', code, (err as Error).message);
        }
      }
    }),
  );
}

async function sendEmail(text: string): Promise<void> {
  if (!emailEnabled) return;
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.resend.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.resend.from,
      to: env.resend.to,
      subject: 'NOVA — новая активность',
      text,
    }),
  });
  if (!r.ok) console.error('[notify] email:', r.status, await r.text());
}

/**
 * Единая точка уведомлений о новой активности.
 * Каналы по приоритету: Telegram → web-push → email.
 * Каждый канал активен только при наличии своих ключей; ошибки не пробрасываются.
 * Вызывать без await (fire-and-forget).
 */
export async function notifyNewActivity(
  conversation: Conversation,
  message: Message | null,
): Promise<void> {
  const kind = message ? 'новое сообщение' : 'новый лид';
  console.log(`[notify] ${kind}: conv=${conversation.id} contact=${conversation.contact}`);

  const text = buildText(conversation, message);
  await Promise.allSettled([
    sendTelegram(text),
    sendWebPush(conversation, message),
    sendEmail(text),
  ]);
}
