import type { Request, Response, NextFunction } from 'express';
import type { Conversation } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

// расширяем Request, чтобы протащить найденный диалог в обработчик
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      conversation?: Conversation;
    }
  }
}

/**
 * Проверяет доступ клиента к своему диалогу: :id из пути + заголовок X-Anon-Token.
 * Кладёт найденный диалог в req.conversation.
 */
export async function anonAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.header('X-Anon-Token');
  const { id } = req.params;

  if (!token) {
    res.status(401).json({ error: 'missing_anon_token' });
    return;
  }

  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation || conversation.anonToken !== token) {
    // не различаем «нет диалога» и «чужой токен» — чтобы не палить существование id
    res.status(403).json({ error: 'forbidden' });
    return;
  }

  req.conversation = conversation;
  next();
}
