FROM node:22-alpine

# Install curl for healthchecks and required build tools if needed
RUN apk add --no-cache curl ffmpeg

WORKDIR /app

# Copy package descriptors
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy application source code and public assets
COPY src/ ./src/
COPY public/ ./public/

# Create uploads directory and ensure correct permissions
RUN mkdir -p public/uploads

# Expose server port
EXPOSE 3000

# Healthcheck monitoring server status
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/status || exit 1

# Start server
CMD ["node", "src/server.js"]
