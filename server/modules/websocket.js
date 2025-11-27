/**
 * WebSocket Manager for Real-time Updates
 * Handles WebSocket connections and broadcasting document updates
 */

const { Server } = require('socket.io');
const { logger } = require('../middleware/logger');

class WebSocketManager {
  constructor() {
    this.io = null;
    this.connectedClients = new Map(); // userId -> Set of socketIds
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow all localhost origins in development
          if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            return callback(null, true);
          }
          // In production, check allowed origins
          callback(null, true); // For now, allow all - can be restricted later
        },
        credentials: true
      }
    });

    this.io.on('connection', (socket) => {
      logger.debug('WebSocket client connected', { socketId: socket.id });

      // Client authenticates with JWT token
      socket.on('authenticate', (data) => {
        const { token, userId } = data;
        if (userId) {
          if (!this.connectedClients.has(userId)) {
            this.connectedClients.set(userId, new Set());
          }
          this.connectedClients.get(userId).add(socket.id);
          socket.userId = userId;
          logger.debug('User authenticated on socket', { userId, socketId: socket.id });
        }
      });

      // Client subscribes to document updates
      socket.on('subscribe-document', (documentId) => {
        socket.join(`document-${documentId}`);
        logger.debug('Socket subscribed to document', { socketId: socket.id, documentId });
      });

      // Client unsubscribes from document updates
      socket.on('unsubscribe-document', (documentId) => {
        socket.leave(`document-${documentId}`);
        logger.debug('Socket unsubscribed from document', { socketId: socket.id, documentId });
      });

      // Client subscribes to organization updates
      socket.on('subscribe-organization', (organizationId) => {
        socket.join(`organization-${organizationId}`);
        logger.debug('Socket subscribed to organization', { socketId: socket.id, organizationId });
      });

      // Client unsubscribes from organization updates
      socket.on('unsubscribe-organization', (organizationId) => {
        socket.leave(`organization-${organizationId}`);
        logger.debug('Socket unsubscribed from organization', { socketId: socket.id, organizationId });
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

    return this.io;
  }

  /**
   * Broadcast document update to all clients viewing the document
   */
  broadcastDocumentUpdate(documentId, eventType, data) {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot broadcast update');
      return;
    }

    this.io.to(`document-${documentId}`).emit('document-update', {
      documentId,
      eventType, // 'vote', 'comment', 'proposal', etc.
      data,
      timestamp: new Date().toISOString()
    });

    logger.debug('Broadcasted document update', { eventType, documentId });
  }

  /**
   * Broadcast vote update specifically
   */
  broadcastVoteUpdate(documentId, proposalId, paragraphId, voteData) {
    this.broadcastDocumentUpdate(documentId, 'vote', {
      proposalId,
      paragraphId,
      vote: voteData
    });
  }

  /**
   * Broadcast comment update
   */
  broadcastCommentUpdate(documentId, proposalId, paragraphId, commentData) {
    this.broadcastDocumentUpdate(documentId, 'comment', {
      proposalId,
      paragraphId,
      comment: commentData
    });
  }

  /**
   * Broadcast proposal update
   */
  broadcastProposalUpdate(documentId, paragraphId, proposalData) {
    this.broadcastDocumentUpdate(documentId, 'proposal', {
      paragraphId,
      proposal: proposalData
    });
  }

  /**
   * Broadcast organization update to all clients subscribed to the organization
   */
  broadcastOrganizationUpdate(organizationId, eventType, data) {
    if (!this.io) {
      logger.warn('WebSocket not initialized, cannot broadcast organization update', { organizationId });
      return;
    }

    this.io.to(`organization-${organizationId}`).emit('organization-update', {
      organizationId,
      eventType, // 'governance-rules-updated', 'election-created', 'member-added', etc.
      data,
      timestamp: new Date().toISOString()
    });

    logger.debug('Broadcasted organization update', { eventType, organizationId });

    // Also broadcast to all organization documents for backward compatibility
    // This ensures document views also get organization updates
    // Note: This requires a database query, so we'll do it in the calling code
  }
}

// Singleton instance
const webSocketManager = new WebSocketManager();

module.exports = webSocketManager;

