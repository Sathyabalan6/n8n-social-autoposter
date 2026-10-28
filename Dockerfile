# ============================================================================
# SocialPulse Studio - Enterprise Multi-Stage Production Dockerfile
# Follows CIS & OWASP container security standards (Non-root user, slim base)
# ============================================================================

# 1. Dependency Installation Stage
FROM node:24-alpine AS dependencies
WORKDIR /app

# Install build dependencies for native compilation if required
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. Production Runner Stage
FROM node:24-alpine AS runner
WORKDIR /app

# Ensure security updates and required runtime utilities (ffmpeg/ffprobe if needed)
RUN apk add --no-cache ffmpeg curl

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy node modules and project source
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src/ ./src/
COPY public/ ./public/

# Create uploads directory and assign ownership to unprivileged 'node' user
RUN mkdir -p /app/public/uploads && chown -R node:node /app

# Switch to unprivileged standard node user
USER node

# Healthcheck using liveness probe
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/status || exit 1

EXPOSE 3000

CMD ["node", "src/server.js"]
