FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Install mediainfo for audio language detection
RUN apt-get update && apt-get install -y --no-install-recommends \
    mediainfo \
    && rm -rf /var/lib/apt/lists/*

# Install Angular CLI globally
RUN npm install -g @angular/cli
