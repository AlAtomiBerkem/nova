import type { Request } from 'express';
import { env } from './env.js';
import { clientIp } from './crypto.js';

/**
 * Проверяет токен Cloudflare Turnstile.
 * Если TURNSTILE_SECRET не задан — капча отключена, проверка проходит (graceful).
 * Токен клиент шлёт в теле как `captchaToken` или заголовке `cf-turnstile-response`.
 */
export async function verifyTurnstile(req: Request): Promise<boolean> {
  if (!env.turnstileSecret) return true; // капча выключена

  const token =
    (req.body?.captchaToken as string | undefined) ??
    req.header('cf-turnstile-response') ??
    '';
  if (!token) return false;

  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret: env.turnstileSecret,
        response: token,
        remoteip: clientIp(req),
      }),
    });
    const data = (await r.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verify error:', err);
    return false;
  }
}
