# Multi-stage Docker build for Colabora (Node 20 required for Tailwind CSS 4 / @tailwindcss/oxide)
FROM node:20-alpine AS builder

# Install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Create app user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci || (echo "ERROR: npm ci failed" && exit 1) && npm cache clean --force

# Copy source code
COPY . .

# Git metadata for the client build (.git is excluded from context; pass via Kamal builder args)
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_TIME=${BUILD_TIME}

# Build the application with increased memory
RUN NODE_OPTIONS="--max-old-space-size=2048" npm run build || (echo "ERROR: Build failed" && exit 1)

# Verify build artifacts exist and check build size
RUN test -d client/build || (echo "ERROR: client/build directory not found" && exit 1) && \
    test -f client/build/index.html || (echo "ERROR: client/build/index.html not found" && exit 1) && \
    test -f client/build/legal/en/privacy.md || (echo "ERROR: client/build/legal markdown missing" && exit 1) && \
    test -f client/build/locales/en/emails.json || (echo "ERROR: client/build/locales/en/emails.json missing" && exit 1) && \
    test -f client/build/logo-light.png || (echo "ERROR: client/build/logo-light.png missing" && exit 1) && \
    BUILD_SIZE=$(du -sh client/build | cut -f1) && \
    echo "Build verification passed: client/build directory and index.html exist (size: $BUILD_SIZE)" && \
    # Warn if build is unusually large (>100MB)
    BUILD_SIZE_BYTES=$(du -sb client/build | cut -f1) && \
    if [ "$BUILD_SIZE_BYTES" -gt 104857600 ]; then \
      echo "WARNING: Build size is large ($BUILD_SIZE), consider optimizing"; \
    fi

# Production stage
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && apk add --no-cache dumb-init curl && \
    rm -rf /var/cache/apk/*

# Create app user and directories
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /app && \
    chown -R nodejs:nodejs /app

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
COPY --from=builder --chown=nodejs:nodejs /app/knex ./knex
COPY --from=builder --chown=nodejs:nodejs /app/knexfile.js ./knexfile.js

# Create health check script with better error handling and logging (before switching to non-root user)
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo '# Health check for Colabora' >> /healthcheck.sh && \
    echo 'set +e' >> /healthcheck.sh && \
    echo '# Retry logic for health check' >> /healthcheck.sh && \
    echo 'MAX_RETRIES=2' >> /healthcheck.sh && \
    echo 'RETRY_DELAY=1' >> /healthcheck.sh && \
    echo 'TIMEOUT=5' >> /healthcheck.sh && \
    echo 'READY_ENDPOINT="http://localhost:3000/api/health/ready"' >> /healthcheck.sh && \
    echo 'BASIC_ENDPOINT="http://localhost:3000/health"' >> /healthcheck.sh && \
    echo '' >> /healthcheck.sh && \
    echo '# Try readiness endpoint with retries' >> /healthcheck.sh && \
    echo 'for i in $(seq 1 $MAX_RETRIES); do' >> /healthcheck.sh && \
    echo '  RESPONSE=$(curl -sf --max-time $TIMEOUT --connect-timeout 2 $READY_ENDPOINT 2>&1)' >> /healthcheck.sh && \
    echo '  EXIT_CODE=$?' >> /healthcheck.sh && \
    echo '  if [ $EXIT_CODE -eq 0 ]; then' >> /healthcheck.sh && \
    echo '    # Check if status is "ready" (or "starting" during startup - handled by start-period)' >> /healthcheck.sh && \
    echo '    if echo "$RESPONSE" | grep -qE '"'"'"status"\s*:\s*"ready"'"'"'; then' >> /healthcheck.sh && \
    echo '      exit 0' >> /healthcheck.sh && \
    echo '    fi' >> /healthcheck.sh && \
    echo '    # Also allow "starting" status (grace period handled by Docker start-period)' >> /healthcheck.sh && \
    echo '    if echo "$RESPONSE" | grep -qE '"'"'"status"\s*:\s*"starting"'"'"'; then' >> /healthcheck.sh && \
    echo '      exit 0' >> /healthcheck.sh && \
    echo '    fi' >> /healthcheck.sh && \
    echo '  fi' >> /healthcheck.sh && \
    echo '  if [ $i -lt $MAX_RETRIES ]; then' >> /healthcheck.sh && \
    echo '    sleep $RETRY_DELAY' >> /healthcheck.sh && \
    echo '  fi' >> /healthcheck.sh && \
    echo 'done' >> /healthcheck.sh && \
    echo '' >> /healthcheck.sh && \
    echo '# If readiness endpoint failed, try basic health endpoint as fallback' >> /healthcheck.sh && \
    echo 'RESPONSE=$(curl -sf --max-time 3 --connect-timeout 1 $BASIC_ENDPOINT 2>&1)' >> /healthcheck.sh && \
    echo 'if [ $? -eq 0 ]; then' >> /healthcheck.sh && \
    echo '  # Server is responding, even if not fully ready' >> /healthcheck.sh && \
    echo '  exit 0' >> /healthcheck.sh && \
    echo 'fi' >> /healthcheck.sh && \
    echo '' >> /healthcheck.sh && \
    echo '# All health checks failed' >> /healthcheck.sh && \
    echo 'exit 1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

# Create startup script with better logging (before switching to non-root user)
RUN echo '#!/bin/sh' > /start.sh && \
    echo 'echo "🚀 Starting Colabora in Docker container"' >> /start.sh && \
    echo 'echo "📍 Environment: $NODE_ENV"' >> /start.sh && \
    echo 'echo "🚪 Port: $PORT"' >> /start.sh && \
    echo 'echo "💾 Database: $DATABASE_URL"' >> /start.sh && \
    echo 'echo "👤 User: $(id)"' >> /start.sh && \
    echo 'echo "📁 Working directory: $(pwd)"' >> /start.sh && \
    echo 'echo "🗃️  Running database migrations..."' >> /start.sh && \
    echo 'npm run db:migrate || { echo "❌ Database migrations failed"; exit 1; }' >> /start.sh && \
    echo 'echo "🔄 Starting application..."' >> /start.sh && \
    echo 'exec npm start' >> /start.sh && \
    chmod +x /start.sh

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production

# Security: Don't expose sensitive defaults
# SESSION_SECRET, JWT_SECRET, and DATABASE_URL must be provided via environment variables
# Expected DATABASE_URL format: postgresql://user:password@host:5432/database

# Expose port
EXPOSE 3000

# Health check - increased start period and retries for better reliability
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD /healthcheck.sh

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["/start.sh"]
