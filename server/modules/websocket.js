/**
 * WebSocket Manager for Real-time Updates
 * Handles WebSocket connections and broadcasting document updates
 */

const { Server } = require('socket.io');
const { logger } = require('../middleware/logger');
const config = require('../config');
const jwt = require('jsonwebtoken');
const { transformForApi } = require('../utils/dataTransform');
const TransactionManager = require('../database/services/KnexTransactionManager');

class WebSocketManager {
  constructor() {
    this.io = null;
    this.db = null; // Database reference for authorization checks
    this.connectedClients = new Map(); // userId -> Set of socketIds
    this.initialized = false;
    this.initializationError = null;
  }

  /**
   * Set database reference for authorization checks (Knex instance)
   * @param {Object} knex - Knex instance
   */
  setDatabase(knex) {
    this.db = knex; // Store Knex instance
  }

  /**
   * Check if user has access to a document
   * @param {string} userId - User ID
   * @param {string} documentId - Document ID
   * @returns {Promise<boolean>} True if user has access
   */
  async checkDocumentAccess(userId, documentId) {
    if (!this.db) {
      logger.warn('WebSocket: Database not set, skipping document access check');
      return true; // Fail open if no DB (shouldn't happen in production)
    }

    try {
      const query = `
        SELECT d.id
        FROM documents d
        LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
        LEFT JOIN organization_members om ON d.organization_id = om.organization_id AND om.user_id = ? AND om.status = 'active'
        LEFT JOIN organization_representatives org_reps ON d.organization_id = org_reps.organization_id AND org_reps.user_id = ? AND org_reps.status = 'active'
        WHERE d.id = ? 
          AND (
            d.owner_id = ? 
            OR dc.user_id IS NOT NULL 
            OR om.user_id IS NOT NULL
            OR org_reps.user_id IS NOT NULL
          )
      `;
      
      const result = await this.db.raw(query, [userId, userId, userId, documentId, userId]);
      const rows = result.rows || result || [];
      return rows.length > 0;
    } catch (error) {
      logger.error('WebSocket: Error checking document access', { 
        errorMessage: error?.message || 'Unknown error', 
        userId, 
        documentId 
      });
      return false; // Fail closed on error
    }
  }

  /**
   * Check if user has access to an organization
   * @param {string} userId - User ID
   * @param {string} organizationId - Organization ID
   * @returns {Promise<boolean>} True if user has access
   */
  async checkOrganizationAccess(userId, organizationId) {
    if (!this.db) {
      logger.warn('WebSocket: Database not set, skipping organization access check');
      return true; // Fail open if no DB (shouldn't happen in production)
    }

    try {
      // Use TransactionManager.query() which automatically normalizes SQL for PostgreSQL compatibility
      const query = `
        SELECT o.id
        FROM organizations o
        LEFT JOIN organization_members om ON o.id = om.organization_id AND om.user_id = ? AND om.status = 'active'
        LEFT JOIN organization_representatives org_reps ON o.id = org_reps.organization_id AND org_reps.user_id = ? AND org_reps.status = 'active'
        WHERE o.id = ? 
          AND o.is_active = true
          AND (om.user_id IS NOT NULL OR org_reps.user_id IS NOT NULL)
      `;
      
      const result = await TransactionManager.query(this.db, query, [userId, userId, organizationId]);
      return !!result;
    } catch (error) {
      logger.error('WebSocket: Error checking organization access', { 
        errorMessage: error?.message || 'Unknown error', 
        userId, 
        organizationId 
      });
      return false; // Fail closed on error
    }
  }

  /**
   * Check if user has access to a meeting (via the meeting's organization)
   * @param {string} userId - User ID
   * @param {string} meetingId - Meeting ID
   * @returns {Promise<boolean>} True if user has access
   */
  async checkMeetingAccess(userId, meetingId) {
    if (!this.db) {
      logger.warn('WebSocket: Database not set, skipping meeting access check');
      return true; // Fail open if no DB (shouldn't happen in production)
    }

    try {
      const row = await this.db('meetings').where({ id: meetingId }).select('organization_id').first();
      if (!row || !row.organization_id) {
        return false;
      }
      return this.checkOrganizationAccess(userId, row.organization_id);
    } catch (error) {
      logger.error('WebSocket: Error checking meeting access', {
        errorMessage: error?.message || 'Unknown error',
        userId,
        meetingId
      });
      return false; // Fail closed on error
    }
  }

  /**
   * Initialize WebSocket server
   * @param {http.Server} server - HTTP server instance
   * @param {Object} redisClient - Optional Redis client for multi-instance support
   * @param {Object} knex - Optional Knex database instance for authorization checks
   * @returns {Object} Result object with success status and optional error
   */
  async initialize(server, redisClient = null, knex = null) {
    try {
      if (!server) {
        const error = new Error('Server instance is required for WebSocket initialization');
        logger.error('WebSocket initialization failed', { errorMessage: error.message });
        this.initializationError = error;
        this.initialized = false;
        return { success: false, error: error.message };
      }

      // Set database reference BEFORE creating Socket.IO server and registering handlers
      // This ensures database is available when first connection handler is triggered
      if (knex) {
        this.db = knex;
        logger.debug('WebSocket database reference set before initialization');
      } else {
        logger.warn('WebSocket initialized without database reference - authorization checks will be skipped until setDatabase() is called');
      }

      const allowedOrigins = new Set(
        (config.ALLOWED_ORIGINS || [])
          .map(o => o && o.trim())
          .filter(Boolean)
      );
      if (config.FRONTEND_URL) {
        allowedOrigins.add(config.FRONTEND_URL);
      }

      const socketIOConfig = {
        cors: {
          origin: (origin, callback) => {
            if (!origin) {
              if (config.NODE_ENV === 'production') {
                logger.warn('WebSocket CORS blocked request without origin');
                return callback(new Error('Not allowed by CORS'));
              }
              return callback(null, true);
            }

            if (config.NODE_ENV === 'development' &&
                (origin.startsWith('http://localhost:') ||
                 origin.startsWith('http://127.0.0.1:') ||
                 origin === 'http://localhost' ||
                 origin === 'http://127.0.0.1')) {
              return callback(null, true);
            }

            if (allowedOrigins.has(origin)) {
              return callback(null, true);
            }

            logger.warn('WebSocket CORS blocked origin', { 
              origin, 
              allowedOrigins: Array.from(allowedOrigins).join(', ') || 'none',
              environment: config.NODE_ENV
            });
            return callback(new Error(`Not allowed by CORS: ${origin}`));
          },
          credentials: true
        },
        // Allow both transports so clients can fall back to polling when WebSocket is blocked (e.g. proxy/firewall)
        transports: process.env.WS_TRANSPORT_WEBSOCKET_ONLY === 'true' ? ['websocket'] : ['websocket', 'polling'],
        pingTimeout: 60000,        // 60 seconds - longer for stability
        pingInterval: 25000,       // 25 seconds - check connection health
        maxHttpBufferSize: 1e6,    // 1MB max message size
        allowEIO3: true,           // Backward compatibility
        // Connection state recovery: re-run auth middleware on recovery so reconnecting clients re-validate JWT
        connectionStateRecovery: {
          maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
          skipMiddlewares: false
        }
      };

      // Add Redis adapter for multi-instance support if Redis is available
      if (redisClient && process.env.REDIS_URL) {
        try {
          // Try to load Redis adapter (may not be installed in all environments)
          let createAdapter;
          try {
            createAdapter = require('@socket.io/redis-adapter').createAdapter;
          } catch (requireError) {
            logger.warn('@socket.io/redis-adapter not available, WebSocket will use default adapter', {
              error: requireError.message,
              hint: 'Install with: npm install @socket.io/redis-adapter'
            });
            throw requireError;
          }

          const pubClient = redisClient.duplicate ? redisClient.duplicate() : redisClient;
          const subClient = redisClient.duplicate ? redisClient.duplicate() : redisClient;
          
          // Ensure clients are connected
          if (pubClient.status !== 'ready') {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('Redis connection timeout')), 5000);
              pubClient.once('ready', () => {
                clearTimeout(timeout);
                resolve();
              });
              pubClient.once('error', reject);
            });
          }

          socketIOConfig.adapter = createAdapter(pubClient, subClient);
          logger.info('WebSocket using Redis adapter (multi-instance support enabled)');
        } catch (adapterError) {
          logger.warn('Failed to initialize Redis adapter for WebSocket, continuing without it', {
            error: adapterError.message,
            mode: 'single instance'
          });
          // Continue without Redis adapter (single instance mode)
        }
      } else {
        logger.info('WebSocket using default adapter (single instance mode)');
      }

      this.io = new Server(server, socketIOConfig);

      // Require JWT on connection (auth header preferred, token payload allowed)
      this.io.use((socket, next) => {
        // Declare token outside try block so it's accessible in catch
        const authHeader = socket.handshake.headers?.authorization || '';
        const tokenFromHeader = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;
        const token = tokenFromHeader || socket.handshake.auth?.token || socket.handshake.query?.token;

        try {
          if (!token) {
            return next(new Error('Authentication token required'));
          }

          const decoded = jwt.verify(token, config.JWT_CONFIG.secret, {
            issuer: config.JWT_CONFIG.issuer,
            audience: config.JWT_CONFIG.audience
          });

          socket.user = {
            id: decoded.userId,
            email: decoded.email,
            name: decoded.name
          };
          return next();
        } catch (err) {
          // Log as debug for expected failures (no token, expired token) to reduce log noise
          // Only warn for unexpected errors (malformed tokens, etc.)
          if (!token || err.message === 'jwt expired' || err.message === 'invalid signature') {
            logger.debug('WebSocket authentication failed (expected)', { error: err.message });
          } else {
            logger.warn('WebSocket authentication failed (unexpected)', { error: err.message });
          }
          return next(new Error('Authentication failed'));
        }
      });

    this.io.on('connection', (socket) => {
      logger.debug('WebSocket client connected', { socketId: socket.id });

      // Client registers after successful JWT check
      socket.on('register-session', () => {
        const userId = socket.user?.id;
        if (!userId) {
          logger.warn('WebSocket: register-session called but no user found', { socketId: socket.id });
          return;
        }

        if (!this.connectedClients.has(userId)) {
          this.connectedClients.set(userId, new Set());
        }
        this.connectedClients.get(userId).add(socket.id);
        socket.userId = userId;
        logger.info('WebSocket session registered', { 
          userId, 
          socketId: socket.id,
          totalSocketsForUser: this.connectedClients.get(userId).size
        });
      });

      // Client subscribes to document updates (with authorization check)
      socket.on('subscribe-document', async (documentId) => {
        const userId = socket.user?.id;
        if (!userId) {
          logger.warn('WebSocket: subscribe-document rejected - no user', { socketId: socket.id, documentId });
          socket.emit('subscription-error', { type: 'document', id: documentId, error: 'Authentication required' });
          return;
        }

        try {
          const hasAccess = await this.checkDocumentAccess(userId, documentId);
          if (!hasAccess) {
            logger.warn('WebSocket: subscribe-document rejected - access denied', { userId, documentId, socketId: socket.id });
            socket.emit('subscription-error', { type: 'document', id: documentId, error: 'Access denied' });
            return;
          }

          socket.join(`document-${documentId}`);
          const room = this.io.sockets.adapter.rooms.get(`document-${documentId}`);
          const roomSize = room ? room.size : 0;
          logger.info('Socket subscribed to document', { 
            socketId: socket.id, 
            documentId, 
            userId,
            roomSize,
            totalClientsInRoom: roomSize
          });
        } catch (error) {
          logger.error('WebSocket: subscribe-document error', { 
            errorMessage: error?.message || 'Unknown error', 
            userId, 
            documentId 
          });
          socket.emit('subscription-error', { type: 'document', id: documentId, error: 'Subscription failed' });
        }
      });

      // Client unsubscribes from document updates
      socket.on('unsubscribe-document', (documentId) => {
        socket.leave(`document-${documentId}`);
        const room = this.io.sockets.adapter.rooms.get(`document-${documentId}`);
        const roomSize = room ? room.size : 0;
        logger.debug('Socket unsubscribed from document', { 
          socketId: socket.id, 
          documentId,
          remainingClientsInRoom: roomSize
        });
      });

      // Client subscribes to organization updates (with authorization check)
      socket.on('subscribe-organization', async (organizationId) => {
        const userId = socket.user?.id;
        if (!userId) {
          logger.warn('WebSocket: subscribe-organization rejected - no user', { socketId: socket.id, organizationId });
          socket.emit('subscription-error', { type: 'organization', id: organizationId, error: 'Authentication required' });
          return;
        }

        try {
          const hasAccess = await this.checkOrganizationAccess(userId, organizationId);
          if (!hasAccess) {
            logger.warn('WebSocket: subscribe-organization rejected - access denied', { userId, organizationId, socketId: socket.id });
            socket.emit('subscription-error', { type: 'organization', id: organizationId, error: 'Access denied' });
            return;
          }

          socket.join(`organization-${organizationId}`);
          logger.debug('Socket subscribed to organization', { socketId: socket.id, organizationId, userId });
        } catch (error) {
          logger.error('WebSocket: subscribe-organization error', { 
            errorMessage: error?.message || 'Unknown error', 
            userId, 
            organizationId 
          });
          socket.emit('subscription-error', { type: 'organization', id: organizationId, error: 'Subscription failed' });
        }
      });

      // Client unsubscribes from organization updates
      socket.on('unsubscribe-organization', (organizationId) => {
        socket.leave(`organization-${organizationId}`);
        logger.debug('Socket unsubscribed from organization', { socketId: socket.id, organizationId });
      });

      // Client subscribes to meeting room (minutes, votes, brainstorm, etc.)
      socket.on('subscribe-meeting', async (meetingId) => {
        const userId = socket.user?.id;
        if (!userId) {
          logger.warn('WebSocket: subscribe-meeting rejected - no user', { socketId: socket.id, meetingId });
          socket.emit('subscription-error', { type: 'meeting', id: meetingId, error: 'Authentication required' });
          return;
        }

        if (!meetingId || typeof meetingId !== 'string' || !meetingId.trim()) {
          logger.warn('WebSocket: subscribe-meeting rejected - invalid meetingId', { userId, socketId: socket.id });
          socket.emit('subscription-error', { type: 'meeting', id: meetingId, error: 'Invalid meeting ID' });
          return;
        }

        try {
          const hasAccess = await this.checkMeetingAccess(userId, meetingId.trim());
          if (!hasAccess) {
            logger.warn('WebSocket: subscribe-meeting rejected - access denied', { userId, meetingId, socketId: socket.id });
            socket.emit('subscription-error', { type: 'meeting', id: meetingId, error: 'Access denied' });
            return;
          }

          const roomName = `meeting-${meetingId.trim()}`;
          socket.join(roomName);
          const room = this.io.sockets.adapter.rooms.get(roomName);
          const roomSize = room ? room.size : 0;
          logger.info('Socket subscribed to meeting', {
            socketId: socket.id,
            meetingId: meetingId.trim(),
            userId,
            roomSize
          });
        } catch (error) {
          logger.error('WebSocket: subscribe-meeting error', {
            errorMessage: error?.message || 'Unknown error',
            userId,
            meetingId
          });
          socket.emit('subscription-error', { type: 'meeting', id: meetingId, error: 'Subscription failed' });
        }
      });

      // Client unsubscribes from meeting room
      socket.on('unsubscribe-meeting', (meetingId) => {
        if (meetingId && typeof meetingId === 'string') {
          const roomName = `meeting-${meetingId.trim()}`;
          socket.leave(roomName);
          logger.debug('Socket unsubscribed from meeting', { socketId: socket.id, meetingId: meetingId.trim() });
        }
      });

      // Client subscribes to activity feed updates (for viewing activity feed with multiple documents)
      socket.on('subscribe-activity-feed', async (documentIds) => {
        const userId = socket.user?.id;
        if (!userId) {
          logger.warn('WebSocket: subscribe-activity-feed rejected - no user', { socketId: socket.id });
          socket.emit('subscription-error', { type: 'activity-feed', error: 'Authentication required' });
          return;
        }

        try {
          // Validate document access for all documents
          if (!Array.isArray(documentIds) || documentIds.length === 0) {
            logger.warn('WebSocket: subscribe-activity-feed rejected - invalid documentIds', { userId, socketId: socket.id });
            socket.emit('subscription-error', { type: 'activity-feed', error: 'Invalid document IDs' });
            return;
          }

          // Check access for all documents (batch check would be more efficient, but this is simpler)
          const accessChecks = await Promise.all(
            documentIds.map(docId => this.checkDocumentAccess(userId, docId))
          );
          
          const accessibleDocs = documentIds.filter((_, index) => accessChecks[index]);
          
          if (accessibleDocs.length === 0) {
            logger.warn('WebSocket: subscribe-activity-feed rejected - no access to any documents', { userId, socketId: socket.id });
            socket.emit('subscription-error', { type: 'activity-feed', error: 'Access denied to all documents' });
            return;
          }

          // Join activity feed room (user-specific for filtering)
          socket.join(`activity-feed-${userId}`);
          
          // Store subscribed document IDs on socket for filtering broadcasts
          socket.activityFeedDocumentIds = accessibleDocs;
          
          logger.info('Socket subscribed to activity feed', { 
            socketId: socket.id, 
            userId,
            documentCount: accessibleDocs.length,
            totalRequested: documentIds.length
          });
        } catch (error) {
          logger.error('WebSocket: subscribe-activity-feed error', { 
            errorMessage: error?.message || 'Unknown error', 
            userId 
          });
          socket.emit('subscription-error', { type: 'activity-feed', error: 'Subscription failed' });
        }
      });

      // Client unsubscribes from activity feed updates
      socket.on('unsubscribe-activity-feed', () => {
        const userId = socket.user?.id;
        if (userId) {
          socket.leave(`activity-feed-${userId}`);
          socket.activityFeedDocumentIds = null;
          logger.debug('Socket unsubscribed from activity feed', { socketId: socket.id, userId });
        }
      });

      socket.on('disconnect', () => {
        logger.debug('WebSocket client disconnected', { socketId: socket.id });
        if (socket.userId) {
          const userSockets = this.connectedClients.get(socket.userId);
          if (userSockets) {
            userSockets.delete(socket.id);
            if (userSockets.size === 0) {
              this.connectedClients.delete(socket.userId);
            }
          }
        }
      });
    });

    // Set up error handlers for the IO instance
    this.io.on('error', (error) => {
      logger.error('WebSocket server error', {
        errorMessage: error?.message || 'Unknown error',
        stack: error?.stack
      });
    });

    this.initialized = true;
    this.initializationError = null;
    logger.info('WebSocket server initialized successfully');
    return { success: true, io: this.io };
    } catch (error) {
      logger.error('WebSocket initialization failed', {
        errorMessage: error?.message || 'Unknown error',
        stack: error?.stack
      });
      this.initialized = false;
      this.initializationError = error;
      this.io = null;
      return { success: false, error: error?.message || 'Unknown error' };
    }
  }

  /**
   * Check if WebSocket is initialized and available
   * @returns {boolean} True if WebSocket is initialized
   */
  isInitialized() {
    return this.initialized && this.io !== null;
  }

  /**
   * Get initialization error if any
   * @returns {Error|null} Initialization error or null
   */
  getInitializationError() {
    return this.initializationError;
  }

  /**
   * Broadcast document update to all clients viewing the document
   */
  broadcastDocumentUpdate(documentId, eventType, data) {
    try {
      if (!this.io) {
        logger.warn('WebSocket not initialized, cannot broadcast update');
        return;
      }

      const room = this.io.sockets.adapter.rooms.get(`document-${documentId}`);
      const roomSize = room ? room.size : 0;
      
      // Transform data to camelCase for consistency with API responses
      const transformedData = data ? transformForApi(data) : null;
      
      // Broadcast to document room (for document view)
      this.io.to(`document-${documentId}`).emit('document-update', {
        documentId,
        eventType, // 'vote', 'comment', 'proposal', etc.
        data: transformedData,
        timestamp: new Date().toISOString()
      });

      // Also broadcast to activity feed rooms (for activity feed view)
      this.broadcastActivityFeedUpdate(documentId, eventType, data);

      logger.info('Broadcasted document update', { 
        eventType, 
        documentId,
        clientsInRoom: roomSize,
        hasData: !!data
      });
    } catch (error) {
      logger.error('WebSocket broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        stack: error?.stack,
        documentId,
        eventType 
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast vote update specifically
   */
  broadcastVoteUpdate(documentId, proposalId, paragraphId, voteData) {
    try {
      this.broadcastDocumentUpdate(documentId, 'vote', {
        proposalId,
        paragraphId,
        vote: voteData
      });
    } catch (error) {
      logger.error('WebSocket vote broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        documentId,
        proposalId 
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast comment update
   * @param {string} documentId - Document ID
   * @param {string} commentableId - Commentable entity ID (proposal ID or structure proposal ID)
   * @param {string} paragraphId - Paragraph ID (may be null for structure proposals)
   * @param {Object} commentData - Comment data object
   * @param {string} [action='created'] - Action type: 'created', 'updated', or 'deleted'
   * @param {string} [commentableType='proposal'] - Type of commentable entity ('proposal' or 'structure_proposal')
   */
  broadcastCommentUpdate(documentId, commentableId, paragraphId, commentData, action = 'created', commentableType = 'proposal') {
    try {
      // Determine event type from commentable_type
      const eventType = commentableType === 'structure_proposal' 
        ? 'structure-proposal-comment' 
        : 'comment';
      
      this.broadcastDocumentUpdate(documentId, eventType, {
        proposalId: commentableId, // Keep for backward compatibility
        paragraphId: paragraphId || null,
        comment: commentData,
        action // Explicit action for better frontend handling
      });
    } catch (error) {
      logger.error('WebSocket comment broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        documentId,
        commentableId,
        commentableType,
        action
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast comment upvote change so clients can update counts without refetching.
   * @param {string} documentId - Document ID
   * @param {string} commentId - Comment ID
   * @param {number} upvoteCount - New upvote count
   */
  broadcastCommentUpvote(documentId, commentId, upvoteCount) {
    try {
      this.broadcastDocumentUpdate(documentId, 'comment-upvote', {
        commentId,
        upvoteCount
      });
    } catch (error) {
      logger.error('WebSocket comment upvote broadcast failed', {
        errorMessage: error?.message || 'Unknown error',
        documentId,
        commentId
      });
    }
  }

  /**
   * Broadcast proposal update
   */
  broadcastProposalUpdate(documentId, paragraphId, proposalData) {
    try {
      this.broadcastDocumentUpdate(documentId, 'proposal', {
        paragraphId,
        proposal: proposalData
      });
    } catch (error) {
      logger.error('WebSocket proposal broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        documentId,
        paragraphId 
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast organization update to all clients subscribed to the organization
   */
  broadcastOrganizationUpdate(organizationId, eventType, data) {
    try {
      if (!this.io) {
        logger.warn('WebSocket not initialized, cannot broadcast organization update', { organizationId });
        return;
      }

      // Transform data to camelCase for consistency with API responses
      const transformedData = data ? transformForApi(data) : null;
      
      this.io.to(`organization-${organizationId}`).emit('organization-update', {
        organizationId,
        eventType, // 'governance-rules-updated', 'election-created', 'member-added', etc.
        data: transformedData,
        timestamp: new Date().toISOString()
      });

      logger.debug('Broadcasted organization update', { eventType, organizationId });

      // Also broadcast to all organization documents for backward compatibility
      // This ensures document views also get organization updates
      // Note: This requires a database query, so we'll do it in the calling code
    } catch (error) {
      logger.error('WebSocket organization broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        stack: error?.stack,
        organizationId,
        eventType 
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast meeting update to all clients in the meeting room.
   * Used for minutes events, votes, brainstorm, moderators, finalize.
   * Brainstorm start/end are delivered via minutes-event-added (data.event.eventType brainstorm_started/brainstorm_ended).
   * @param {string} meetingId - Meeting ID
   * @param {string} eventType - One of: minutes-event-added, vote-started, vote-ended, vote-updated,
   *   brainstorm-option-added, moderator-added, moderator-removed, minutes-finalized, agenda-*, current-topic-changed, minutes-timeline-reordered
   * @param {Object} [data] - Event payload (will be transformed to camelCase)
   */
  broadcastMeetingUpdate(meetingId, eventType, data) {
    try {
      if (!this.io) {
        logger.warn('WebSocket not initialized, cannot broadcast meeting update', { meetingId });
        return;
      }

      const transformedData = data ? transformForApi(data) : null;
      this.io.to(`meeting-${meetingId}`).emit('meeting-update', {
        eventType,
        data: transformedData,
        timestamp: new Date().toISOString()
      });

      logger.debug('Broadcasted meeting update', { eventType, meetingId });
    } catch (error) {
      logger.error('WebSocket meeting broadcast failed', {
        errorMessage: error?.message || 'Unknown error',
        stack: error?.stack,
        meetingId,
        eventType
      });
      // Don't throw - allow the application to continue
    }
  }

  /**
   * Broadcast activity feed update to all clients subscribed to activity feed
   * This is more efficient than subscribing to individual document rooms
   * @param {string} documentId - Document ID that was updated
   * @param {string} eventType - Type of event (vote, comment, proposal, etc.)
   * @param {Object} data - Event data
   */
  broadcastActivityFeedUpdate(documentId, eventType, data) {
    try {
      if (!this.io) {
        logger.warn('WebSocket not initialized, cannot broadcast activity feed update');
        return;
      }

      // Transform data to camelCase for consistency with API responses
      const transformedData = data ? transformForApi(data) : null;
      
      // Get all sockets in activity feed rooms
      const activityFeedRooms = Array.from(this.io.sockets.adapter.rooms.keys())
        .filter(roomName => roomName.startsWith('activity-feed-'));
      
      let totalClients = 0;
      
      // Broadcast to each activity feed room
      activityFeedRooms.forEach(roomName => {
        const room = this.io.sockets.adapter.rooms.get(roomName);
        if (!room) return;
        
        // Get all sockets in this room and filter by document ID
        room.forEach(socketId => {
          const socket = this.io.sockets.sockets.get(socketId);
          if (!socket || !socket.activityFeedDocumentIds) return;
          
          // Only send if this socket is subscribed to this document
          if (socket.activityFeedDocumentIds.includes(documentId)) {
            socket.emit('activity-feed-update', {
              documentId,
              eventType,
              data: transformedData,
              timestamp: new Date().toISOString()
            });
            totalClients++;
          }
        });
      });

      logger.debug('Broadcasted activity feed update', { 
        eventType, 
        documentId,
        clientsNotified: totalClients,
        roomsChecked: activityFeedRooms.length
      });
    } catch (error) {
      logger.error('WebSocket activity feed broadcast failed', { 
        errorMessage: error?.message || 'Unknown error', 
        stack: error?.stack,
        documentId,
        eventType 
      });
      // Don't throw - allow the application to continue
    }
  }
}

// Singleton instance
const webSocketManager = new WebSocketManager();

module.exports = webSocketManager;

