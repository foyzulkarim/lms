# Multi-stage Dockerfile for LLM Gateway Service
# Centralized LLM request management with caching and queue processing

# ===================
# BASE STAGE
# ===================
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    # Basic utilities
    curl \
    wget \
    # Build tools
    make \
    g++ \
    python3

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S llmuser -u 1001

# Create necessary directories
RUN mkdir -p /app/logs && \
    chown -R llmuser:nodejs /app

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
COPY --chown=llmuser:nodejs . .

# Switch to non-root user
USER llmuser

# Expose port
EXPOSE 3009

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3009/health || exit 1

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
COPY --chown=llmuser:nodejs config/ ./config/
COPY --chown=llmuser:nodejs migrations/ ./migrations/
COPY --chown=llmuser:nodejs scripts/ ./scripts/

# Switch to non-root user
USER llmuser

# Expose port
EXPOSE 3009

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3009/health || exit 1

# Production command
CMD ["node", "dist/main.js"]
