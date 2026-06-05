import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { conversationsRouter } from './routes/conversations.js';
import { uploadsRouter } from './routes/uploads.js';
import { adminRouter } from './routes/admin.js';

const app = express();

// За nginx-прокси — доверяем заголовкам X-Forwarded-* (нужно для реального IP).
app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true, // нужны cookie для админки
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// --- health check для docker / nginx ---
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: 'up' });
  } catch {
    res.status(503).json({ ok: false, db: 'down' });
  }
});

// --- публичное API ---
app.use('/api/conversations', conversationsRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/admin', adminRouter);

// --- 404 для неизвестных /api ---
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// --- единый обработчик ошибок ---
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error('[error]', err);
    res.status(500).json({ error: 'internal_error' });
  },
);

const server = app.listen(env.port, () => {
  console.log(`NOVA backend слушает на :${env.port} (${env.nodeEnv})`);
});

// аккуратное завершение для docker
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`\n${sig} — закрываюсь...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  });
}
