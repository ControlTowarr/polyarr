# Stage 1: Build frontend
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci --workspace=frontend
COPY frontend/ ./frontend/
RUN npm run build:frontend

# Stage 2: Build backend
FROM node:22-alpine AS backend-build
WORKDIR /app
COPY package*.json tsconfig*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --workspace=backend
COPY backend/ ./backend/
RUN npm run build:backend

# Stage 3: Production
FROM node:22-alpine AS production
RUN apk add --no-cache mediainfo python3 make g++
WORKDIR /app

# Install production dependencies
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --workspace=backend && npm cache clean --force

# Remove build tools to keep image slim
RUN apk del python3 make g++

# Copy backend build
COPY --from=backend-build /app/backend/dist ./dist

# Copy frontend build into public directory
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public

# Create data directory
RUN mkdir -p /app/data

ENV NODE_ENV=production
ENV PORT=3000
ENV DATA_DIR=/app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
