# Stage 1: Build frontend (runs natively on builder platform for speed & zero QEMU emulation crashes)
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

# Stage 2: Build backend (runs natively on builder platform for fast TypeScript compilation)
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
COPY tsconfig.base.json /app/
COPY backend/package*.json ./
RUN npm install
COPY backend/ ./
RUN npm run build

# Stage 3: Production (target architectures: linux/amd64, linux/arm64)
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
    mediainfo \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled architecture-independent assets
COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
