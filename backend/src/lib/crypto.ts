import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { env } from './env.js';

/** Хеш IP с солью — храним именно его, а не сырой IP (privacy + антиспам). */
export function hashIp(ip: string): string {
  return createHash('sha256').update(env.ipHashSalt + ip).digest('hex');
}

/** Реальный IP клиента с учётом nginx-прокси (trust proxy включён). */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
