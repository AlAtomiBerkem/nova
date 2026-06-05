import type { Request, Response, NextFunction } from 'express';
import { env } from '../lib/env.js';
import { verifyAdminToken, type AdminTokenPayload } from '../lib/auth.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

/** Пускает дальше только при валидном JWT в httpOnly-cookie. */
export function adminAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[env.cookieName];
  if (!token) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  try {
    req.admin = verifyAdminToken(token);
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
