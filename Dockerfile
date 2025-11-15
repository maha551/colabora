# Multi-stage Docker build for Colabora
FROM node:18-alpine AS builder

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build the application with increased memory
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build

# Production stage
FROM node:18-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app user and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app /data && \
    chown -R nodejs:nodejs /app /data

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/client/build ./client/build
COPY --from=builder --chown=nodejs:nodejs /app/server ./server
COPY --from=builder --chown=nodejs:nodejs /app/scripts ./scripts

# Create health check script with better error handling
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo '# Health check for Colabora' >> /healthcheck.sh && \
    echo 'set -e' >> /healthcheck.sh && \
    echo '# Give app time to start' >> /healthcheck.sh && \
    echo 'sleep 5' >> /healthcheck.sh && \
    echo '# Check health endpoint with timeout' >> /healthcheck.sh && \
    echo 'curl -f --max-time 10 --retry 2 --retry-delay 2 http://localhost:3000/api/health/ready || exit 1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Security: Don't expose sensitive defaults
# SESSION_SECRET and JWT_SECRET must be provided via environment variables
ENV DATABASE_URL="sqlite:////data/colabora.db"

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD /healthcheck.sh

# Create startup script with better logging
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "🚀 Starting Colabora in Docker container"' >> /start.sh && \
    echo 'echo "📍 Environment: $NODE_ENV"' >> /start.sh && \
    echo 'echo "🚪 Port: $PORT"' >> /start.sh && \
    echo 'echo "💾 Database: $DATABASE_URL"' >> /start.sh && \
    echo 'echo "👤 User: $(id)"' >> /start.sh && \
    echo 'echo "📁 Working directory: $(pwd)"' >> /start.sh && \
    echo 'echo "💿 Disk usage:"' >> /start.sh && \
    echo 'df -h /data 2>/dev/null || echo "No /data mount found"' >> /start.sh && \
    echo 'echo "🔄 Starting application..."' >> /start.sh && \
    echo 'exec npm start' >> /start.sh && \
    chmod +x /start.sh

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["/start.sh"]
