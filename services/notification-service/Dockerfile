# Multi-stage build for Notification Service
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY migrations/ ./migrations/
COPY knexfile.ts ./

# Build the application
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S notification -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache dumb-init curl

# Copy built application
COPY --from=builder --chown=notification:nodejs /app/dist ./dist
COPY --from=builder --chown=notification:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=notification:nodejs /app/package*.json ./
COPY --from=builder --chown=notification:nodejs /app/migrations ./migrations
COPY --from=builder --chown=notification:nodejs /app/knexfile.ts ./

# Create necessary directories
RUN mkdir -p /app/logs && chown notification:nodejs /app/logs

# Switch to non-root user
USER notification

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3006/health || exit 1

# Start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# Labels
LABEL maintainer="LMS Platform Team <support@lms.example.com>"
LABEL version="2.0.0"
LABEL description="Multi-channel notification service with EMAIL-Dispatcher integration"
LABEL service="notification-service"
