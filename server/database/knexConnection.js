const knex = require('knex');
const { logger } = require('../middleware/logger');

/**
 * Knex Connection Manager
 * Manages PostgreSQL database connections with pooling.
 */
class KnexConnection {
  constructor(config) {
    this.config = config;
    this.knex = null;
    this.isInitialized = false;
    this.isRecovering = false;
    this.recoveryAttempts = 0;
    this.maxRecoveryAttempts = 5;
    this.dbType = this.detectDatabaseType();
  }

  /**
   * Detect database type from DATABASE_URL
   * @returns {string} 'postgresql'
   */
  detectDatabaseType() {
    const dbUrl = this.config.DATABASE_URL || '';
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql:// for runtime.');
    }
    return 'postgresql';
  }

  /**
   * Check if error is a definitive connection termination error
   * @param {Error} err - Error object
   * @returns {boolean}
   */
  isDefinitiveConnectionError(err) {
    return err.message && (
      err.message.includes('Connection terminated') ||
      err.message.includes('connection closed') ||
      err.message.includes('connection lost') ||
      err.message.includes('server closed the connection')
    );
  }

  /**
   * Check if error is a connection-related error (broader than definitive termination)
   * Includes network errors, timeouts, and connection termination messages
   * @param {Error} err - Error object
   * @returns {boolean}
   */
  isConnectionError(err) {
    if (!err) return false;
    
    // Check error codes
    const connectionErrorCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET'];
    if (connectionErrorCodes.includes(err.code)) {
      return true;
    }
    
    // Check error messages
    if (err.message) {
      const connectionErrorMessages = [
        'Connection terminated',
        'connection closed',
        'connection lost',
        'Connection ended',
        'server closed the connection'
      ];
      return connectionErrorMessages.some(msg => 
        err.message.includes(msg)
      );
    }
    
    return false;
  }

  /**
   * Check if pool has working connections
   * @returns {boolean}
   */
  hasWorkingConnections() {
    const poolStats = this.getPoolStats();
    return poolStats && (poolStats.free > 0 || poolStats.used > 0);
  }

  /**
   * Calculate exponential backoff delay
   * @param {number} attempt - Current attempt number (1-based)
   * @param {number} initialDelay - Initial delay in milliseconds
   * @param {number} maxDelay - Maximum delay in milliseconds
   * @param {number} multiplier - Backoff multiplier (default: 2)
   * @returns {number} Delay in milliseconds
   */
  calculateBackoffDelay(attempt, initialDelay = 1000, maxDelay = 5000, multiplier = 2) {
    return Math.min(initialDelay * Math.pow(multiplier, attempt - 1), maxDelay);
  }

  /**
   * Get connection pool configuration
   * @returns {Object}
   */
  getPoolConfig() {
    // Capture instance reference and config values for use in afterCreate hook (context may change)
    const connectionInstance = this;
      const keepaliveEnabled = this.config.PG_KEEPALIVE_ENABLED !== false;
      // Reduce initial delay to start keepalive probes sooner (30 seconds instead of 60)
      // This helps prevent connection termination on database servers with short idle timeouts
      const keepaliveInitialDelay = this.config.PG_KEEPALIVE_INITIAL_DELAY || 30000; // 30 seconds
      // Recycle idle connections before cloud DBs (e.g. Fly Postgres) close them (~60s). Override with PG_SOCKET_TIMEOUT.
      const socketTimeout = this.config.PG_SOCKET_TIMEOUT || 55000; // 55s default
      const statementTimeout = this.config.PG_STATEMENT_TIMEOUT || 60000; // 60s default (was 300000); avoid stuck queries holding connections
      const idleTransactionTimeout = this.config.PG_IDLE_TRANSACTION_TIMEOUT || 20000; // 20s default (was 60000); release connections idle in transaction sooner
      
      // Production: default min=2, max=10 to avoid single-connection exhaustion on Fly.io.
      // Development: default min=2, max=20. Explicit env PG_POOL_MIN/PG_POOL_MAX override.
      const isProduction = this.config.NODE_ENV === 'production';
      const defaultMin = isProduction ? 2 : 2;
      const defaultMax = isProduction ? 10 : 20;
      const poolMin = parseInt(this.config.PG_POOL_MIN, 10);
      const poolMax = parseInt(this.config.PG_POOL_MAX, 10);
      const poolMinFinal = Number.isFinite(poolMin) ? Math.max(1, poolMin) : defaultMin;
      const poolMaxFinal = Number.isFinite(poolMax) ? Math.max(poolMinFinal, poolMax) : defaultMax;
      
      // Log pool configuration for debugging
      logger.info('PostgreSQL connection pool configuration', {
        PG_POOL_MIN: this.config.PG_POOL_MIN,
        PG_POOL_MAX: this.config.PG_POOL_MAX,
        parsedMin: poolMinFinal,
        parsedMax: poolMaxFinal,
        note: 'If pool shows fewer connections, database max_connections may be limiting it. Set PG_POOL_MIN and PG_POOL_MAX on Fly if you see "Connection pool exhausted".'
      });
      
    return {
        min: poolMinFinal,
        max: poolMaxFinal,
        idleTimeoutMillis: 30000, // 30 seconds - shorter timeout helps remove dead connections faster
        acquireTimeoutMillis: parseInt(this.config.PG_POOL_ACQUIRE_TIMEOUT) || 30000, // 30s timeout - increased for better handling under load
        createTimeoutMillis: 10000,
        reapIntervalMillis: 5000, // Check every 5 seconds for idle connections to remove (more aggressive cleanup)
        createRetryIntervalMillis: 200,
        // Validate connections before returning them from the pool
        // This prevents returning dead connections that appear "free" but are actually invalid
        validate: (conn) => {
          // Check if connection is in a valid state
          if (!conn) {
            return false;
          }
          
          // Check if connection has been destroyed or ended
          if (conn._ending || conn._destroyed) {
            return false;
          }
          
          // Check if connection stream is still valid
          const stream = conn.stream || conn.connection?.stream || conn._stream;
          if (stream) {
            if (stream.destroyed || !stream.writable || stream.ended) {
              return false;
            }
          }
          
          // Connection appears valid - return true
          // Note: We don't do a full query here as it would be too slow
          // The connection will be validated when used, and errors will be caught
          return true;
        },
        // After creating a connection, set up error handlers and statement timeout
        // Use parallel execution to speed up setup and ensure connections are always added to pool
        afterCreate: (conn, done) => {
          // Configure TCP keepalive on the connection socket IMMEDIATELY
          // This must be the FIRST thing we do, before any queries
          if (keepaliveEnabled) {
            try {
              // Try multiple ways to access the socket (pg library structure may vary)
              let socket = null;
              
              // Method 1: Direct stream property (most common in pg library)
              if (conn.stream && typeof conn.stream.setKeepAlive === 'function') {
                socket = conn.stream;
              }
              // Method 2: Connection property (some versions)
              else if (conn.connection && conn.connection.stream && typeof conn.connection.stream.setKeepAlive === 'function') {
                socket = conn.connection.stream;
              }
              // Method 3: Direct connection property
              else if (conn.connection && typeof conn.connection.setKeepAlive === 'function') {
                socket = conn.connection;
              }
              // Method 4: _stream property (internal, but sometimes accessible)
              else if (conn._stream && typeof conn._stream.setKeepAlive === 'function') {
                socket = conn._stream;
              }
              
              if (socket) {
                // Enable TCP keepalive IMMEDIATELY
                // First parameter: enable keepalive (true)
                // Second parameter: initial delay in milliseconds before first keepalive probe
                // Note: This must be done BEFORE any queries to prevent connection termination
                socket.setKeepAlive(true, keepaliveInitialDelay);
                
                // Set additional socket options for better connection stability
                if (socket.setNoDelay) {
                  socket.setNoDelay(true); // Disable Nagle's algorithm for lower latency
                }
                
                // Set socket timeout to detect dead connections faster
                // This is different from keepalive - it's a total inactivity timeout
                if (socket.setTimeout) {
                  socket.setTimeout(socketTimeout);
                  socket.on('timeout', () => {
                    // Always destroy on idle timeout so the pool reaps this connection and creates
                    // a fresh one. Prevents using connections the server (e.g. MPG/PGBouncer) already closed.
                    logger.warn('PostgreSQL connection socket timeout - recycling idle connection', {
                      timeoutMs: socketTimeout
                    });
                    if (socket.destroy && !socket.destroyed) {
                      socket.destroy();
                    }
                  });
                }
                
                // Log successful configuration (only in debug mode to avoid log spam)
                if (connectionInstance.config.NODE_ENV === 'development') {
                  logger.debug('TCP keepalive configured on PostgreSQL connection', {
                    keepaliveInitialDelay,
                    socketTimeout,
                    socketType: socket.constructor?.name || 'unknown'
                  });
                }
              } else {
                // Log warning if we can't find socket (important for production debugging)
                // This is a critical configuration that prevents connection termination
                const availableProps = Object.keys(conn).filter(key => 
                  conn[key] && typeof conn[key] === 'object' && 
                  (conn[key].setKeepAlive || conn[key].stream)
                );
                logger.warn('Could not configure TCP keepalive - socket not found', {
                  availableProperties: availableProps.length > 0 ? availableProps : Object.keys(conn).slice(0, 10),
                  hasStream: !!conn.stream,
                  hasConnection: !!conn.connection,
                  connectionType: conn.constructor?.name || 'unknown',
                  note: 'Connection may be terminated by database server if idle timeout is shorter than keepalive delay'
                });
              }
            } catch (keepaliveError) {
              // Log but don't fail connection setup if keepalive configuration fails
              // This allows the connection to proceed even if keepalive setup fails
              logger.warn('Failed to configure TCP keepalive on connection', {
                error: keepaliveError?.message || String(keepaliveError)
              });
            }
          }
          
          // Set up connection error handler FIRST (before any queries)
          conn.on('error', (err) => {
            logger.error('PostgreSQL connection error', {
              error: err.message,
              code: err.code
            });
            // Use standardized error detection logic
            const isDefinitiveTermination = connectionInstance.isDefinitiveConnectionError(err);
            
            // CRITICAL: Destroy the connection immediately if it's definitively terminated
            // This ensures dead connections are removed from the pool
            if (isDefinitiveTermination) {
              try {
                // Destroy the connection to remove it from the pool
                if (conn.destroy && typeof conn.destroy === 'function') {
                  conn.destroy();
                } else if (conn.end && typeof conn.end === 'function') {
                  conn.end();
                }
                logger.debug('Destroyed dead connection after error', {
                  error: err.message,
                  code: err.code
                });
              } catch (destroyError) {
                logger.warn('Failed to destroy connection after error', {
                  error: err.message,
                  destroyError: destroyError.message
                });
              }
            }
            
            if (isDefinitiveTermination) {
              // Check pool stats before making decisions
              const poolStats = connectionInstance.getPoolStats();
              
              // If pool is destroyed (total: 0), mark as uninitialized to trigger recovery
              if (poolStats && poolStats.total === 0) {
                connectionInstance.isInitialized = false;
                logger.error('Connection error detected and pool is destroyed (total: 0) - marking as uninitialized for recovery', {
                  poolStats
                });
              } else if (!connectionInstance.knex && !connectionInstance.hasWorkingConnections()) {
                // Only mark as uninitialized if we don't have a working knex instance AND no working connections
                connectionInstance.isInitialized = false;
                logger.warn('Connection error detected and no working connections - marking as uninitialized');
              } else {
                // Log but don't change state - let health check determine if pool is actually dead
                // Individual connection errors shouldn't destroy the pool if other connections exist
                logger.warn('Connection error detected but pool may have other working connections - will verify via health check', {
                  poolStats: poolStats ? {
                    total: poolStats.total,
                    used: poolStats.used,
                    free: poolStats.free
                  } : null
                });
              }
            }
          });
          
          // Also handle 'end' event which indicates connection was closed
          conn.on('end', () => {
            const poolStats = connectionInstance.getPoolStats();
            if (poolStats && poolStats.total === 0) {
              logger.error('Connection ended and pool is destroyed (total: 0) - marking as uninitialized for recovery', {
                poolStats
              });
              connectionInstance.isInitialized = false;
            } else {
              // Log at debug when pool still has other connections to reduce noise (common on Fly/cloud)
              const logLevel = poolStats && poolStats.total > 1 ? 'debug' : 'warn';
              logger[logLevel]('PostgreSQL connection ended unexpectedly', {
                note: 'Connection was closed by database server or network'
              });
              if (poolStats) {
                const currentPoolConfig = connectionInstance.getPoolConfig();
                logger[logLevel]('Connection ended - pool state', {
                  total: poolStats.total,
                  used: poolStats.used,
                  free: poolStats.free,
                  note: poolStats.total < (currentPoolConfig.max || 20)
                    ? 'Pool size below configured max - database may have low max_connections limit'
                    : 'Pool at configured size'
                });
              }
            }
          });
          
          // Use a single timeout for the entire setup process to ensure done() is always called
          const setupTimeout = setTimeout(() => {
            logger.warn('Connection setup timeout - accepting connection anyway to allow pool to grow');
            done(null, conn);
          }, 8000); // 8 second total timeout for all setup steps
          
          // Track completion of parallel setup steps
          let completed = 0;
          let hasFatalError = false;
          const totalSteps = 3; // statement timeout, idle timeout, validation
          
          // Ensure done() is called exactly once
          let doneCalled = false;
          const callDone = (err) => {
            if (doneCalled) return;
            doneCalled = true;
            clearTimeout(setupTimeout);
            done(err, conn);
          };
          
          // Check if all steps are complete
          const checkComplete = () => {
            completed++;
            if (completed === totalSteps && !hasFatalError) {
              callDone(null);
            }
          };
          
          // Helper to handle query errors in setup steps
          const handleSetupError = (err, stepName) => {
            if (err && connectionInstance.isDefinitiveConnectionError(err)) {
              hasFatalError = true;
              logger.warn(`Connection terminated during ${stepName}`, { error: err.message });
              callDone(err);
              return; // Don't call checkComplete() on fatal errors
            }
            // For other errors, log but continue - connection might still be usable
            if (err) {
              logger.warn(`Failed to ${stepName} - continuing anyway`, { error: err.message });
            }
            checkComplete();
          };
          
          // Step 1: Set statement timeout (non-blocking, runs in parallel)
          conn.query(`SET statement_timeout = ${statementTimeout}`, (err) => {
            handleSetupError(err, 'set statement timeout');
          });
          
          // Step 2: Set idle transaction timeout (non-blocking, runs in parallel)
          conn.query(`SET idle_in_transaction_session_timeout = ${idleTransactionTimeout}`, (err) => {
            handleSetupError(err, 'set idle transaction timeout');
          });
          
          // Step 3: Validate connection (non-blocking, runs in parallel)
          // This validation ensures the connection is actually working before adding to pool
          conn.query('SELECT 1', (err) => {
            if (err && connectionInstance.isDefinitiveConnectionError(err)) {
              hasFatalError = true;
              logger.error('Connection terminated during validation', { error: err.message });
              callDone(err);
              return; // Don't call checkComplete() on fatal errors
            }
            // For other errors, log but accept connection - it might still be usable
            if (err) {
              logger.warn('Connection validation failed - accepting connection anyway', { error: err.message });
            }
            checkComplete();
          });
        }
    };
  }

  /**
   * Get Knex configuration
   * @returns {Object}
   */
  getKnexConfig() {
    const poolConfig = this.getPoolConfig();
    // Parse connection string and add connection timeout if not present
    // The pg library supports connect_timeout via connection string query parameter (in seconds)
    let connectionConfig = this.config.DATABASE_URL;
      
      if (typeof connectionConfig === 'string') {
        try {
          const url = new URL(connectionConfig);
          // Add connect_timeout if not present (in seconds, pg library uses seconds)
          // Increased to 15 seconds to handle slower network conditions and database startup delays
          if (!url.searchParams.has('connect_timeout')) {
            url.searchParams.set('connect_timeout', '15'); // 15 seconds (increased from 10)
          }
          // Note: TCP keepalive is configured in afterCreate hook, not via URL parameters
          // The pg library doesn't support keepalive via connection string
          connectionConfig = url.toString();
        } catch (e) {
          // If URL parsing fails, try to append parameters manually
          // This handles edge cases where URL parsing might fail
          const separator = connectionConfig.includes('?') ? '&' : '?';
          const params = [];
          if (!connectionConfig.includes('connect_timeout')) {
            params.push('connect_timeout=15'); // 15 seconds (increased from 10)
          }
          // Note: TCP keepalive is configured in afterCreate hook, not via URL parameters
          if (params.length > 0) {
            connectionConfig = `${connectionConfig}${separator}${params.join('&')}`;
          }
        }
      }
      
    const knexConfig = {
      client: 'pg',
      connection: connectionConfig,
      pool: poolConfig,
      debug: this.config.NODE_ENV === 'development'
    };

    if (this.config.NODE_ENV === 'test' && process.env.TEST_DB_SCHEMA) {
      knexConfig.searchPath = [process.env.TEST_DB_SCHEMA, 'public'];
    }

    return knexConfig;
  }

  /**
   * Initialize the Knex connection
   * @returns {Promise<Object>} Knex instance
   */
  async initialize() {
    try {
      const knexConfig = this.getKnexConfig();
      this.knex = knex(knexConfig);

      // PostgreSQL optimizations
      // NOTE: These timeout settings are also configured in the afterCreate hook for all connections.
      logger.debug('PostgreSQL timeouts will be configured per-connection via afterCreate hook');

      // Test connection with timeout and retry logic
      // Use retry logic to handle transient connection issues during initialization
      // Give the pool a moment to set up and allow afterCreate hooks to run.
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const maxTestRetries = 5; // Increased retries for more resilience
      let testError = null;
      
      for (let testAttempt = 1; testAttempt <= maxTestRetries; testAttempt++) {
        try {
          // Increase timeout to 15 seconds per attempt (database may be slow to respond or recovering)
          await Promise.race([
            this.knex.raw('SELECT 1 as test'),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Connection test timeout')), 15000); // Increased from 5000 to 15000
            })
          ]);
          // Connection test successful
          testError = null;
          break;
        } catch (err) {
          testError = err;
          
          // Treat timeout and connection termination errors as retryable during initialization
          // The database may be recovering from crashes (OOM kills) or restarting
          const isTimeoutError = testError.message && testError.message.includes('timeout');
          const isConnectionTermination = this.isConnectionError(testError);
          const isRetryable = isConnectionTermination || isTimeoutError;
          
          // If connection test fails due to termination or timeout, retry with exponential backoff
          // This is especially important when database is recovering from OOM kills or restarts
          if (isRetryable && testAttempt < maxTestRetries) {
            const retryDelay = this.calculateBackoffDelay(testAttempt, 2000, 10000); // Longer delays
            logger.warn('Connection test failed, retrying', { 
              attempt: testAttempt, 
              maxRetries: maxTestRetries,
              delay: retryDelay,
              error: testError.message,
              isTimeout: isTimeoutError,
              isConnectionTermination: isConnectionTermination,
              note: 'Connection may need more time to establish or database server may be busy/recovering from restart'
            });
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          
          // If max retries reached, throw the error to be handled at higher level
          // The background retry mechanism will continue attempting to connect
          logger.warn('Connection test failed after all retries', { 
            error: testError.message,
            attempts: testAttempt,
            maxRetries: maxTestRetries,
            note: 'Background retry mechanism will continue attempting to connect'
          });
          throw testError;
        }
      }
      
      // If we exhausted retries, throw the last error
      if (testError) {
        throw testError;
      }
      
      // Add error handlers for PostgreSQL connection pool
      if (this.knex.client && this.knex.client.pool) {
        const pool = this.knex.client.pool;
        
        // Handle pool errors
        pool.on('error', (err) => {
          logger.error('PostgreSQL connection pool error', {
            error: err.message,
            code: err.code,
            stack: err.stack
          });
          
          // Check pool stats immediately to see if pool is destroyed
          const poolStats = this.getPoolStats();
          
          // Use standardized error detection logic
          const isDefinitiveTermination = this.isDefinitiveConnectionError(err);
          
          if (isDefinitiveTermination) {
            // If pool is destroyed (total: 0), mark as uninitialized immediately
            if (poolStats && poolStats.total === 0) {
              this.isInitialized = false;
              logger.error('Connection pool error detected and pool is destroyed (total: 0) - marking as uninitialized for immediate recovery', {
                poolStats
              });
            } else if (!this.hasWorkingConnections()) {
              // Pool-level errors are more serious than individual connection errors
              this.isInitialized = false;
              logger.warn('Connection pool error detected and no working connections - marking as uninitialized for recovery', {
                poolStats
              });
            } else {
              // Log but don't change state - pool may still have working connections
              logger.warn('Connection pool error detected but may have working connections - will verify via health check', {
                poolStats: poolStats ? {
                  total: poolStats.total,
                  used: poolStats.used,
                  free: poolStats.free
                } : null
              });
            }
          } else {
            // Log other pool errors but check if pool is destroyed
            if (poolStats && poolStats.total === 0) {
              this.isInitialized = false;
              logger.error('Connection pool error detected and pool is destroyed (total: 0) - marking as uninitialized for recovery', {
                poolStats
              });
            } else {
              // Log but don't change state - let health check verify
              logger.warn('Connection pool error detected but may be transient - will verify via health check', {
                poolStats: poolStats ? {
                  total: poolStats.total,
                  used: poolStats.used,
                  free: poolStats.free
                } : null
              });
            }
          }
        });
      }
      
      this.isInitialized = true;
      this.recoveryAttempts = 0;
      
      // Warm up the pool by creating minimum connections.
      if (this.knex.client && this.knex.client.pool) {
        const poolConfig = this.getPoolConfig();
        const minConnections = poolConfig.min;
        
        // Warm up pool by creating minimum connections in parallel
        // This prevents the "Unable to acquire a connection" error after recovery
        try {
          const warmupPromises = [];
          for (let i = 0; i < minConnections; i++) {
            warmupPromises.push(
              this.knex.raw('SELECT 1').catch(err => {
                // Log but don't fail - some connections might fail during warmup
                logger.debug('Connection warmup attempt failed (may be transient)', {
                  attempt: i + 1,
                  error: err.message
                });
                return null;
              })
            );
          }
          
          // Wait for all warmup attempts (with timeout to prevent hanging)
          await Promise.race([
            Promise.all(warmupPromises),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Pool warmup timeout')), 10000);
            })
          ]).catch(err => {
            // Log but don't fail initialization - pool will create connections on-demand
            logger.warn('Pool warmup incomplete but continuing', {
              error: err.message,
              note: 'Pool will create connections on-demand as needed'
            });
          });
          
          // Give pool a moment to stabilize after warmup
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const poolStats = this.getPoolStats();
          const poolConfig = this.getPoolConfig();
          logger.info('Pool warmup completed', {
            minConnections,
            configuredMax: poolConfig.max,
            actualConnections: poolStats ? poolStats.total : 'unknown',
            note: poolStats && poolStats.total < minConnections 
              ? 'Some connections may still be initializing' 
              : poolStats && poolStats.total < poolConfig.max
              ? `Pool size (${poolStats.total}) is below configured max (${poolConfig.max}) - database max_connections may be limiting it`
              : 'Pool ready'
          });

          try {
            const maxConnResult = await this.knex.raw("SELECT current_setting('max_connections')::int as value");
            const dbMax = maxConnResult?.rows?.[0]?.value ?? maxConnResult?.[0]?.value;
            if (dbMax != null && poolConfig.max > 0 && poolConfig.max > 0.8 * dbMax) {
              logger.warn('PG_POOL_MAX may exceed database capacity', {
                PG_POOL_MAX: poolConfig.max,
                databaseMaxConnections: dbMax,
                recommendation: 'If running multiple app instances, total connections = instances × PG_POOL_MAX; set PG_POOL_MAX so total is below 80% of database max_connections. Run: node scripts/check-max-connections.js'
              });
            }
          } catch (_) {
            // Ignore; check is optional
          }
        } catch (warmupError) {
          // Don't fail initialization if warmup fails - pool will work on-demand
          logger.warn('Pool warmup failed but continuing', {
            error: warmupError.message,
            note: 'Pool will create connections on-demand'
          });
        }
      }
      
      const poolConfig = this.getPoolConfig();
      const poolStats = this.getPoolStats();
      logger.info('Knex connection initialized', {
        dbType: this.dbType,
        poolConfig: {
          min: poolConfig.min,
          max: poolConfig.max,
          acquireTimeoutMillis: poolConfig.acquireTimeoutMillis,
          idleTimeoutMillis: poolConfig.idleTimeoutMillis
        },
        initialPoolStats: poolStats,
        envVars: {
          PG_POOL_MIN: this.config.PG_POOL_MIN || 'not set (using default)',
          PG_POOL_MAX: this.config.PG_POOL_MAX || 'not set (using default)',
          PG_POOL_ACQUIRE_TIMEOUT: this.config.PG_POOL_ACQUIRE_TIMEOUT || 'not set (using default)'
        }
      });

      return this.knex;
    } catch (error) {
      logger.error('Failed to initialize Knex connection', {
        error: error.message,
        stack: error.stack,
        dbType: this.dbType
      });
      throw new Error(`Failed to initialize database connection: ${error.message}`);
    }
  }

  /**
   * Get the Knex instance
   * @returns {Object} Knex instance
   */
  getInstance() {
    if (!this.isInitialized || !this.knex) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.knex;
  }

  /**
   * Check connection health
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      // Check initialization state first - if not initialized, connection is not healthy
      if (!this.isInitialized) {
        logger.debug('Database health check: not initialized');
        return false;
      }
      
      if (!this.knex) {
        return false;
      }
      
      // Check pool stats before attempting query to avoid timeout
      const poolStats = this.getPoolStats();
      if (poolStats) {
        // CRITICAL: If pool total is 0, the pool has been destroyed - immediate recovery needed
        if (poolStats.total === 0) {
          logger.error('Database health check: pool destroyed (total: 0) - immediate recovery required', { 
            poolStats,
            note: 'Pool has been completely destroyed. This requires immediate recovery.'
          });
          // Mark as uninitialized to trigger recovery
          this.isInitialized = false;
          return false;
        }
        
        // If pool is exhausted, don't make it worse by trying to acquire another connection
        // However, if we have connections in use, the pool is working - just busy
        if (poolStats.free === 0 && poolStats.used >= poolStats.total) {
          // If we have connections in use, the pool exists and is working (just busy)
          // Only return false if pool is in a bad state (no connections at all)
          if (poolStats.used > 0) {
            logger.debug('Database health check: pool busy (all connections in use), but pool is working', { 
              poolStats,
              note: 'Skipping query to avoid contributing to exhaustion, but pool is functional'
            });
            return true; // Pool exists and has active connections - it's working, just busy
          } else {
            logger.warn('Database health check: pool exhausted with no active connections', { 
              poolStats 
            });
            return false; // Pool exists but has no active connections - something is wrong
          }
        }
        
        // If there are many pending requests, the pool is under stress
        // Still try the health check but with a shorter timeout
        if (poolStats.pending > 20) {
          logger.warn('Database health check: many pending requests, using shorter timeout', { 
            poolStats 
          });
        }
      } else {
        // Pool stats unavailable - pool may be destroyed
        logger.warn('Database health check: pool stats unavailable - pool may be destroyed', {
          hasKnex: !!this.knex,
          hasClient: !!(this.knex && this.knex.client),
          hasPool: !!(this.knex && this.knex.client && this.knex.client.pool)
        });
        // If we can't get pool stats, the pool is likely destroyed
        this.isInitialized = false;
        return false;
      }
      
      // Use a shorter timeout if pool is under stress to avoid contributing to exhaustion
      const timeoutMs = poolStats && poolStats.pending > 10 ? 2000 : 5000;
      
      // Use a timeout to prevent health check from hanging
      // Create a timeout promise that can be cleaned up
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Health check query timeout')), timeoutMs);
      });
      
      try {
        const result = await Promise.race([
          this.knex.raw('SELECT 1 as test'),
          timeoutPromise
        ]);
        
        // Clear timeout if query completed in time
        clearTimeout(timeoutId);
      
        // Handle different result formats (same pattern as KnexTransactionManager)
        let row = null;
        if (result) {
          if (result.rows && Array.isArray(result.rows)) {
            row = result.rows[0] || null;
          } else if (result && typeof result === 'object' && result.test !== undefined) {
            // Single object result (some edge cases)
            row = result;
          }
        }
        
        // Verify we got the expected result
        if (row && row.test === 1) {
          // Connection test passed - now check pool availability
          const poolStats = this.getPoolStats();
          
          if (poolStats) {
            // Check if pool has available connections
            if (poolStats.free === 0 && poolStats.used >= poolStats.total) {
              logger.warn('Database health check: connection pool exhausted', { poolStats });
              return false;
            }
            
            // Check if there are excessive pending requests
            if (poolStats.pending > 10) {
              logger.warn('Database health check: excessive pending connection requests', { 
                pending: poolStats.pending,
                poolStats 
              });
              // Still return true but log warning - pool may recover
            }
          }
          
          // Connection works and is initialized - healthy
          return true;
        }
        
        // Log what we actually got for debugging
        logger.warn('Database health check returned unexpected result', {
          resultType: typeof result,
          isArray: Array.isArray(result),
          hasRows: !!(result && result.rows),
          result: JSON.stringify(result).substring(0, 200)
        });
        
        return false;
      } catch (error) {
        // Always clear timeout on error
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        
        // Check if this is a timeout error (may be transient)
        const isTimeoutError = error.message && error.message.includes('Health check query timeout');
        
        // Check if this is a connection termination error
        if (this.isConnectionError(error)) {
          // Mark as uninitialized so recovery can be attempted
          this.isInitialized = false;
          logger.warn('Database health check failed - connection terminated', { 
            error: error.message,
            code: error.code
          });
        } else if (isTimeoutError) {
          // Timeout errors are logged but don't immediately mark DB as unavailable
          // The health monitor will track consecutive failures
          logger.warn('Database health check timed out', { 
            timeoutMs,
            poolStats: poolStats ? {
              free: poolStats.free,
              used: poolStats.used,
              pending: poolStats.pending
            } : null
          });
        } else {
          logger.warn('Database health check failed', { 
            error: error.message,
            code: error.code,
            stack: error.stack
          });
        }
        
        return false;
      }
    } catch (error) {
      // Handle any unexpected errors in the outer try block
      logger.error('Unexpected error in database health check', {
        error: error.message,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Get connection pool statistics
   * @returns {Object}
   */
  getPoolStats() {
    if (!this.knex || !this.knex.client) {
      return null;
    }

    const pool = this.knex.client.pool;
    if (!pool) {
      return null;
    }

    const used = pool.numUsed();
    const free = pool.numFree();
    const total = used + free;
    const pending = pool.numPendingAcquires ? pool.numPendingAcquires() : 0;
    
    // Log pool exhaustion events with more detail
    if (free === 0 && total > 0) {
      logger.warn('Connection pool exhausted - no free connections available', {
        total,
        used,
        free,
        pending,
        utilizationPercent: total > 0 ? Math.round((used / total) * 100) : 0,
        recommendation: pending > 5 ? 'Consider increasing pool size or reducing concurrent requests' : 'Pool may recover shortly'
      });
    } else if (pending > 10) {
      logger.warn('Connection pool has many pending requests', {
        total,
        used,
        free,
        pending,
        utilizationPercent: total > 0 ? Math.round((used / total) * 100) : 0,
        recommendation: 'High demand on connection pool - requests may be delayed'
      });
    } else if (pending > 5) {
      logger.info('Connection pool has moderate pending requests', {
        total,
        used,
        free,
        pending,
        utilizationPercent: total > 0 ? Math.round((used / total) * 100) : 0
      });
    }

    return {
      total,
      used,
      free,
      pending,
      utilizationPercent: total > 0 ? Math.round((used / total) * 100) : 0
    };
  }

  /**
   * Attempt to recover connection
   * @returns {Promise<boolean>}
   */
  async attemptRecovery() {
    if (this.isRecovering) {
      logger.debug('Recovery already in progress');
      return false;
    }

    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      logger.error('Max recovery attempts reached', { attempts: this.recoveryAttempts });
      return false;
    }

    this.isRecovering = true;
    this.recoveryAttempts++;

    try {
      logger.info('Attempting database recovery', { attempt: this.recoveryAttempts });

      // Close existing connection if any
      if (this.knex) {
        try {
          const oldStats = this.getPoolStats();
          logger.info('Closing old connection pool during recovery', { oldStats });
          await this.knex.destroy();
          // Ensure pool reference is cleared
          this.knex = null;
        } catch (closeError) {
          logger.warn('Error closing old connection during recovery', { error: closeError.message });
          // Force clear even if destroy failed
          this.knex = null;
        }
      }

      // Reset state before reinitializing
      this.isInitialized = false;
      this.knex = null;
      
      // Reinitialize
      await this.initialize();
      
      // Verify new pool is created successfully
      const newStats = this.getPoolStats();
      if (!newStats) {
        throw new Error('Pool stats not available after recovery - pool may not have been created');
      }
      
      logger.info('Database recovery successful - new pool created', { 
        attempt: this.recoveryAttempts,
        newStats 
      });

      logger.info('Database recovery successful', { attempt: this.recoveryAttempts });
      this.isRecovering = false;
      return true;
    } catch (error) {
      logger.error('Database recovery failed', {
        error: error.message,
        attempt: this.recoveryAttempts
      });
      this.isRecovering = false;
      return false;
    }
  }

  /**
   * Execute operation with retry logic for transient errors
   * @param {Function} operation - Async function that performs the database operation
   * @param {Object} options - Retry options
   * @returns {Promise<any>} Result of the database operation
   */
  async executeWithRetry(operation, options = {}) {
    const {
      maxRetries = 3,
      initialDelay = 100,
      maxDelay = 2000,
      backoffMultiplier = 2
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Check if error is non-retryable first (should not retry these)
        const nonRetryableErrors = ['23505', '23503', '23502', '42P01', '42703']; // unique_violation, foreign_key_violation, not_null_violation, undefined_table, undefined_column
        
        const isNonRetryable = nonRetryableErrors.some(code => 
          error.code === code || 
          error.message.includes(code)
        );
        
        // Non-retryable errors should be thrown immediately
        if (isNonRetryable) {
          throw error;
        }
        
        // Check if error is retryable
        const retryableErrors = ['40P01', '40001', '57P01', '57P02', '57P03']; // PostgreSQL deadlock codes (connection errors handled separately)
        
        // Check for connection errors (network/timeout/termination)
        const isConnectionError = this.isConnectionError(error);
        
        // Check for other retryable errors (deadlocks, etc.)
        const isOtherRetryable = retryableErrors.some(code => 
          error.code === code || 
          error.message.includes(code)
        );
        
        const isRetryable = isConnectionError || isOtherRetryable;
        
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }

        logger.warn(`Database operation failed, retrying (attempt ${attempt + 1}/${maxRetries})`, {
          error: error.message,
          code: error.code,
          delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        delay = this.calculateBackoffDelay(attempt + 1, initialDelay, maxDelay, backoffMultiplier);
      }
    }

    throw lastError;
  }

  /**
   * Close the connection pool
   * @returns {Promise<void>}
   */
  async close() {
    if (this.knex) {
      try {
        const stats = this.getPoolStats();
        logger.info('Closing database connection pool', { stats });
        await this.knex.destroy();
        this.isInitialized = false;
        this.knex = null;
        logger.info('Database connection pool closed');
      } catch (error) {
        logger.error('Error closing database connection pool', { error: error.message });
        throw error;
      }
    }
  }
}

module.exports = KnexConnection;

