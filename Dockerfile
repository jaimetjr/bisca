# syntax=docker/dockerfile:1.7

# ─── Stage 1: build the bundled server ───────────────────────────────────────
# Node 24 (npm 11) — must match the npm generation that writes package-lock.json.
# npm 10 (node:20) builds a different ideal tree for the Sentry/OTel + artillery
# subtrees and rejects the npm-11 lockfile with a false EUSAGE "out of sync".
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
COPY server ./server
COPY shared ./shared
RUN npm run server:build

# ─── Stage 2: runtime image (production deps only) ───────────────────────────
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force

COPY --from=builder /app/server_dist ./server_dist

# Run as a non-root user for safety
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 5000
CMD ["node", "server_dist/index.js"]
