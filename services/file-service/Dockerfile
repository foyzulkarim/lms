# Multi-stage Dockerfile for File Service
# Handles file upload, storage, processing, and delivery

# ===================
# BASE STAGE
# ===================
FROM node:20-alpine AS base

# Install system dependencies for file processing
RUN apk add --no-cache \
    # Basic utilities
    curl \
    wget \
    file \
    # Image processing
    imagemagick \
    # Video processing
    ffmpeg \
    # Document processing
    poppler-utils \
    # Archive handling
    unzip \
    p7zip \
    # Build tools
    make \
    g++ \
    python3 \
    # Security tools
    clamav-daemon \
    clamav-libunrar

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S fileuser -u 1001

# Create necessary directories
RUN mkdir -p /app/uploads /app/temp /app/processing /app/logs /app/quarantine && \
    chown -R fileuser:nodejs /app

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
COPY --chown=fileuser:nodejs . .

# Switch to non-root user
USER fileuser

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

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
COPY --chown=fileuser:nodejs config/ ./config/
COPY --chown=fileuser:nodejs migrations/ ./migrations/
COPY --chown=fileuser:nodejs scripts/ ./scripts/

# Switch to non-root user
USER fileuser

# Expose port
EXPOSE 3004

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3004/health || exit 1

# Production command
CMD ["node", "dist/main.js"]
