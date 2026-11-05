# Multi-stage Dockerfile for Distributed Webhook Dispatcher
# Express API + Frontend + BullMQ Worker

# 1. Base stage
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# 2. Dependencies & Build stage
FROM base AS builder
WORKDIR /app

COPY prisma ./prisma
RUN npm ci
RUN cd frontend && npm ci && cd ..

COPY tsconfig*.json ./
COPY src ./src
COPY frontend ./frontend

RUN npx prisma generate
RUN npm run build:all

# 3. Production runner stage
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma

# Install production dependencies
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Generate Prisma client
RUN npx prisma generate

# Copy compiled application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/frontend/dist ./frontend/dist

# Set permissions
RUN mkdir -p /home/node && chown -R node:node /home/node /app

# Run as non-root user
USER node

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]