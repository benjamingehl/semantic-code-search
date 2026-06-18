FROM oven/bun:1.3

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
COPY mcp ./mcp

ENV INDEX_DB_PATH=/data/code.db

ENTRYPOINT ["bun", "mcp/server.ts"]
