// Идемпотентный сидер админа для прод-старта в контейнере.
// Запускается перед сервером; без ADMIN_EMAIL/ADMIN_PASSWORD — тихо выходит.
import bcrypt from 'bcryptjs';
import { prisma } from './lib/prisma.js';

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL/ADMIN_PASSWORD не заданы — пропускаю создание админа');
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, displayName: process.env.ADMIN_NAME ?? undefined },
    create: { email, passwordHash, displayName: process.env.ADMIN_NAME ?? 'NOVA admin' },
  });
  console.log(`[seed] админ готов: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('[seed] ошибка:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
