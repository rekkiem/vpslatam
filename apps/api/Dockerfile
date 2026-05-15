FROM node:20-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY packages/ ./packages/
COPY prisma/ ./prisma/

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY apps/api/ ./apps/api/
RUN pnpm --filter @vpslatam/api exec prisma generate
RUN pnpm --filter @vpslatam/api run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache git docker-cli

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/prisma ./prisma
COPY apps/api/package.json ./apps/api/

# Entrypoint: run migrations then start
COPY apps/api/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 4000
CMD ["./entrypoint.sh"]
