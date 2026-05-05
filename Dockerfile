# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

ARG PUBLIC_THEME=dark
ENV PUBLIC_THEME=$PUBLIC_THEME

COPY package*.json ./
RUN npm ci

ARG VERSION=dev
ENV PUBLIC_VERSION=$VERSION

COPY . .
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

ARG VERSION=dev
ENV PUBLIC_VERSION=$VERSION

WORKDIR /app

# Copy built app and production deps
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["node", "build"]
