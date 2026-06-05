import type { Request, Response, NextFunction } from 'express';
import { env } from '../lib/env.js';
import { hashIp, clientIp } from '../lib/crypto.js';

// Простой in-memory rate-limit по хешу IP. Для одного инстанса достаточно;
// при масштабировании заменить на Redis (INCR + EXPIRE).
const hits = new Map<string, { count: number; resetAt: number }>();

// периодическая чистка протухших записей, чтобы Map не рос бесконечно
setInterval(() => {
  const now = Date.now();
  for (const [key, v] of hits) if (v.resetAt <= now) hits.delete(key);
}, 60_000).unref();

/** Ограничивает число запросов с одного ipHash за окно (env.rateLimit). */
export function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = hashIp(clientIp(req));
  const now = Date.now();
  const entry = hits.get(key);

  if (!entry || entry.resetAt <= now) {
    hits.set(key, { count: 1, resetAt: now + env.rateLimit.windowMs });
    next();
    return;
  }

  entry.count += 1;
  if (entry.count > env.rateLimit.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'rate_limited', retryAfter });
    return;
  }
  next();
}
