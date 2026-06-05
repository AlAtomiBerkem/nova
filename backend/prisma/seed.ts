import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Создаёт/обновляет админа из ADMIN_EMAIL + ADMIN_PASSWORD.
 * Запуск: ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run seed
 */
async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@nova.local';
  const password = process.env.ADMIN_PASSWORD ?? 'changeme123';
  const displayName = process.env.ADMIN_NAME ?? 'NOVA admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash, displayName },
    create: { email, passwordHash, displayName },
  });

  console.log(`✔ Админ готов: ${admin.email} (id=${admin.id})`);
  if (password === 'changeme123') {
    console.warn('⚠ Используется дефолтный пароль changeme123 — смени в проде!');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
