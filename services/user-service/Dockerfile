# Multi-stage build for User Service
FROM node:20-alpine AS base

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create app directory and user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S userservice -u 1001 -G nodejs

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Development stage
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Change ownership to non-root user
RUN chown -R userservice:nodejs /app

USER userservice

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Start in development mode
CMD ["dumb-init", "npm", "run", "dev"]

# Build stage
FROM base AS builder

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM base AS production

# Set NODE_ENV
ENV NODE_ENV=production

# Copy built application and production dependencies
COPY --from=builder --chown=userservice:nodejs /app/dist ./dist
COPY --from=builder --chown=userservice:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=userservice:nodejs /app/package*.json ./

# Create logs directory
RUN mkdir -p /app/logs && chown -R userservice:nodejs /app/logs

# Switch to non-root user
USER userservice

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["dumb-init", "node", "dist/app.js"]

# Default to production stage
FROM production
