# Multi-stage Dockerfile for LLM Worker Service
# Background processing service for LLM requests with system monitoring

# ===================
# BASE STAGE
# ===================
FROM node:20-alpine AS base

# Install system dependencies for system monitoring
RUN apk add --no-cache \
    # Basic utilities
    curl \
    wget \
    # System monitoring dependencies
    python3 \
    make \
    g++ \
    linux-headers \
    # Process monitoring
    procps \
    # Network monitoring
    net-tools

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llmworker -u 1001

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R llmworker:nodejs /app

# ===================
# DEPENDENCIES STAGE
# ===================
FROM base AS dependencies

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# ===================
# DEVELOPMENT STAGE
# ===================
FROM base AS development

# Install development dependencies
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source code
COPY --chown=llmworker:nodejs . .

# Switch to non-root user
USER llmworker

# Expose health check port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3008/health || exit 1

# Development command
CMD ["npm", "run", "dev"]

# ===================
# BUILD STAGE
# ===================
FROM base AS build

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove development dependencies
RUN npm prune --production

# ===================
# PRODUCTION STAGE
# ===================
FROM base AS production

# Copy production dependencies
COPY --from=dependencies /app/node_modules ./node_modules

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Copy configuration files
COPY --chown=llmworker:nodejs config/ ./config/
COPY --chown=llmworker:nodejs scripts/ ./scripts/

# Switch to non-root user
USER llmworker

# Expose health check port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:3008/health || exit 1

# Production command
CMD ["node", "dist/main.js"]
