# ── Base stage: install pnpm, copy workspace, install deps, build ──
FROM node:22-alpine AS base

RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy everything needed for install + build in one go
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY packages/ packages/

# Install deps and build
RUN pnpm install --frozen-lockfile && pnpm build

# ── API ────────────────────────────────────────────────────────────
FROM node:22-alpine AS api

RUN corepack enable && corepack prepare pnpm@10 --activate && apk add --no-cache wget

WORKDIR /app

COPY --from=base /app /app

EXPOSE 4000
CMD ["node", "packages/api/dist/index.js"]

# ── Web (Vite dev server) ─────────────────────────────────────────
FROM base AS web

EXPOSE 5173
CMD ["pnpm", "--filter", "@sage/web", "dev", "--host"]

# ── Migrate (runs drizzle-kit migrate and exits) ──────────────────
FROM base AS migrate

CMD ["pnpm", "--filter", "@sage/api", "db:migrate"]
