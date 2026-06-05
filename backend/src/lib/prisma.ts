import { PrismaClient } from '@prisma/client';

// Единый инстанс Prisma на всё приложение.
// В dev-режиме tsx watch перезапускает модуль — кешируем на globalThis,
// чтобы не плодить подключения к БД.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
