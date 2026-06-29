FROM node:20-slim

WORKDIR /app

# Prisma의 query engine 바이너리가 openssl을 필요로 한다 (slim 이미지엔 기본 포함 안 됨).
# curl은 docker-compose의 healthcheck에서 쓴다.
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "pnpm prisma migrate deploy && node src/index.js"]
