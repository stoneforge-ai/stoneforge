FROM node:22-slim

# Build deps for better-sqlite3 native compilation + curl for healthcheck
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create data directory for SQLite persistence (volume mount point)
RUN mkdir -p /app/server/data

# Layer cache: install deps first
COPY server/package.json server/
COPY client/package.json client/

RUN npm install -g tsx
RUN cd server && npm install
RUN cd client && npm install

# Copy source
COPY server/ server/
COPY client/ client/

# Build client
RUN cd client && npx vite build

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

WORKDIR /app/server
CMD ["node", "--import", "tsx", "src/index.ts"]
