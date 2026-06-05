import dotenv from 'dotenv';

dotenv.config();

/** Достаёт обязательную переменную окружения или падает на старте. */
function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Не задана обязательная переменная окружения: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProd: process.env.NODE_ENV === 'production',
  port: Number(optional('PORT', '4000')),

  databaseUrl: required('DATABASE_URL'),

  // секрет для подписи JWT админки
  jwtSecret: required('JWT_SECRET'),
  // имя httpOnly-cookie с токеном
  cookieName: optional('AUTH_COOKIE', 'nova_admin'),

  // CORS: список origin'ов фронта через запятую
  corsOrigins: optional('CORS_ORIGINS', 'http://localhost:8080')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // секрет для хеширования IP (антиспам)
  ipHashSalt: optional('IP_HASH_SALT', 'nova-dev-salt'),

  // куда складывать загруженные файлы (на старте — локальная папка)
  uploadDir: optional('UPLOAD_DIR', './uploads'),
  maxUploadBytes: Number(optional('MAX_UPLOAD_BYTES', String(10 * 1024 * 1024))),
};
