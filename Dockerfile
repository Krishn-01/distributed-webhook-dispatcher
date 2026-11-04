# Multi-stage Dockerfile for Distributed Webhook Dispatcher
# 1. Base stage
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./

# 2. Dependencies & Build stage
FROM base AS builder
WORKDIR /app
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npx prisma generate
RUN npm run build

# 3. Production runner stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

# Security: Non-root user
USER node

EXPOSE 3000

# Default command runs the API server (override with `node dist/src/workers/webhook.worker.js` for background worker)
CMD ["node", "dist/src/server.js"]
