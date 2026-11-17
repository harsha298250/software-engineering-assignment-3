# syntax=docker/dockerfile:1

# ==============================================================================
# Stage 1: Install all dependencies & build Vite SPA + Express server bundle
# Uses bun.lock for reproducible installs while running on Node.js 22 Alpine.
# ==============================================================================
FROM node:22-alpine AS builder

COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Build frontend SPA (dist/) and bundle combined Express server (dist-server/server.mjs)
RUN npm run build && \
    npx esbuild server.ts \
      --bundle \
      --platform=node \
      --format=esm \
      --packages=external \
      --outfile=dist-server/server.mjs

# ==============================================================================
# Stage 2: Install production-only dependencies reproducibly
# ==============================================================================
FROM node:22-alpine AS prod-deps

COPY --from=oven/bun:1-alpine /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ==============================================================================
# Stage 3: Minimal non-root production runtime image (zero secrets baked in)
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/api/health || exit 1

CMD ["node", "dist-server/server.mjs"]
