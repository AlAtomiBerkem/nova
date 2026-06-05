import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { env } from './env.js';

export interface AdminTokenPayload {
  sub: string; // adminId
  email: string;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 дней

export function signAdminToken(payload: AdminTokenPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyAdminToken(token: string): AdminTokenPayload {
  return jwt.verify(token, env.jwtSecret) as AdminTokenPayload;
}

/** Ставит httpOnly-cookie с токеном. secure — только по https в проде. */
export function setAuthCookie(res: Response, token: string): void {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.isProd,
    maxAge: MAX_AGE_MS,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(env.cookieName, { path: '/' });
}
