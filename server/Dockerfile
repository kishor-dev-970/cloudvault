# CloudVault backend
FROM node:22-bookworm-slim

# ffmpeg needed for image -> video conversion (fluent-ffmpeg shelling out to the binary)
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps (with lockfile for reproducibility)
COPY package.json package-lock.json ./
RUN npm ci

# Prisma client generation
COPY prisma ./prisma
RUN npx prisma generate

# Build TS -> dist
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime env
ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_URL="file:./dev.db"

EXPOSE 4000

# Ensure the SQLite schema exists (idempotent), then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
