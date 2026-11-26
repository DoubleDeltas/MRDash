FROM node:20-slim

# /수식 도구의 \text{...} 안 한글 렌더링용 글꼴
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-nanum \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY . .

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
