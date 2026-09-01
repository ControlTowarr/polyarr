# Stage 1: Build frontend
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci --include=optional
COPY frontend/ ./frontend/
RUN npm run build:frontend

# Stage 2: Build backend
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --include=optional
COPY backend/ ./backend/
RUN npm run build:backend

# Stage 3: Production
FROM node:22-bookworm-slim AS production
RUN apt-get update && apt-get install -y --no-install-recommends \
    mediainfo \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --workspace=backend && npm cache clean --force

COPY --from=backend-build /app/backend/dist ./dist
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
