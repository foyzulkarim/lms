# Multi-stage Dockerfile for Content Ingestion Service
# Handles content processing, text extraction, and embedding generation

# ===================
# BASE STAGE
# ===================
FROM node:18-alpine AS base

# Install system dependencies for content processing
RUN apk add --no-cache \
    # Basic utilities
    curl \
    wget \
    git \
    # Image processing
    imagemagick \
    # PDF processing
    poppler-utils \
    # OCR capabilities
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-fra \
    tesseract-ocr-data-spa \
    tesseract-ocr-data-deu \
    # Audio/Video processing
    ffmpeg \
    # Python for ML libraries
    python3 \
    py3-pip \
    # Build tools
    make \
    g++ \
    # Additional language support
    icu-dev

# Install Python dependencies for ML operations
RUN pip3 install --no-cache-dir \
    whisper \
    torch \
    torchvision \
    torchaudio \
    transformers \
    sentence-transformers \
    numpy \
    scipy

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories
RUN mkdir -p /app/workspace /app/models /app/logs /tmp/content-processing && \
    chown -R nodejs:nodejs /app /tmp/content-processing

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
COPY --chown=nodejs:nodejs . .

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
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
COPY --chown=nodejs:nodejs config/ ./config/
COPY --chown=nodejs:nodejs scripts/ ./scripts/

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3008

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3008/health || exit 1

# Production command
CMD ["node", "dist/main.js"]
