# syntax=docker/dockerfile:1

# node:20-slim (Debian) ไม่ใช่ Alpine — Prisma engine ต้องการ openssl/glibc ที่ Alpine (musl) ไม่มี
FROM node:20-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate

FROM node:20-slim AS runtime
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p uploads/profile uploads/evidence public/reports
EXPOSE 8000
CMD ["node", "src/server.js"]
