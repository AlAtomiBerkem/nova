import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { env } from '../lib/env.js';

export const uploadsRouter = Router();

// разрешённые типы и их расширения
const ALLOWED: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

await mkdir(env.uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.uploadDir),
  filename: (_req, file, cb) => cb(null, randomUUID() + (ALLOWED[file.mimetype] ?? '')),
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED[file.mimetype]) cb(null, true);
    else cb(new Error('unsupported_mime'));
  },
});

/**
 * POST /api/uploads  (multipart/form-data)
 * Поля: file (файл), conversationId. Заголовок: X-Anon-Token.
 * Лимиты: ≤10 МБ, mime png/jpeg/webp/pdf. Возвращает { attachmentId, url }.
 */
uploadsRouter.post(
  '/',
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'file_too_large', maxBytes: env.maxUploadBytes });
        return;
      }
      if (err) {
        res.status(400).json({ error: 'invalid_upload', detail: String((err as Error).message) });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const token = req.header('X-Anon-Token');
    const conversationId = String(req.body.conversationId ?? '');
    if (!req.file) {
      res.status(400).json({ error: 'no_file' });
      return;
    }

    // проверяем доступ к диалогу
    const conv = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conv || !token || conv.anonToken !== token) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }

    const attachment = await prisma.attachment.create({
      data: {
        conversationId: conv.id,
        url: req.file.filename, // храним только имя файла в хранилище
        fileName: req.file.originalname.slice(0, 200),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
      },
    });

    res.status(201).json({
      attachmentId: attachment.id,
      url: `/api/uploads/${attachment.id}`,
    });
  }),
);

/**
 * GET /api/uploads/:id
 * Отдаёт сам файл по id вложения. id — cuid (неугадываемый),
 * на старте этого достаточно; при необходимости добавим проверку доступа.
 */
uploadsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
    if (!att) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    res.setHeader('Content-Type', att.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.fileName)}"`);
    createReadStream(path.join(env.uploadDir, att.url)).pipe(res);
  }),
);
