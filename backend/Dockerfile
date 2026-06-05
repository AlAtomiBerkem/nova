# ---------- build ----------
FROM node:22-slim AS build
WORKDIR /app

# openssl нужен Prisma для генерации движка
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- runtime ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

# сгенерированный prisma-клиент + dist + схема для migrate deploy
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY prisma ./prisma

# папка под загрузки (на старте — локально, потом S3/R2)
RUN mkdir -p /app/uploads

EXPOSE 4000

# на старте применяем миграции, затем поднимаем сервер
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
