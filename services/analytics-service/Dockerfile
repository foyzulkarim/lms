# ============================================================================
# Analytics Service Dockerfile
# Multi-stage build for production optimization
# ============================================================================

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY src/ ./src/
COPY migrations/ ./migrations/

# Build the application
RUN npm run build

# ============================================================================
# Production stage
# ============================================================================

FROM node:18-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S analytics && \
    adduser -S analytics -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations

# Copy configuration files
COPY knexfile.js ./
COPY .env.example ./

# Create necessary directories
RUN mkdir -p logs reports && \
    chown -R analytics:analytics /app

# Switch to non-root user
USER analytics

# Expose port
EXPOSE 3007

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3007/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]

# ============================================================================
# Development stage (for docker-compose development)
# ============================================================================

FROM node:18-alpine AS development

# Set working directory
WORKDIR /app

# Install development dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs reports

# Expose port
EXPOSE 3007

# Start in development mode
CMD ["npm", "run", "dev"]

# ============================================================================
# Metadata
# ============================================================================

LABEL maintainer="LMS Team <team@lms.com>"
LABEL description="Analytics Service for Learning Management System"
LABEL version="1.0.0"
LABEL org.opencontainers.image.title="LMS Analytics Service"
LABEL org.opencontainers.image.description="Real-time learning analytics, reporting, and business intelligence service"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="LMS Team"
LABEL org.opencontainers.image.licenses="MIT"
