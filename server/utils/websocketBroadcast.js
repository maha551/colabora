/**
 * Centralized WebSocket broadcast helpers for document and organization updates.
 * Routes use these instead of requiring webSocketManager directly.
 */

const webSocketManager = require('../modules/websocket');

/**
 * Broadcast to document room only.
 * @param {string} documentId
 * @param {string} eventType
 * @param {object} payload
 */
function broadcastDocumentUpdate(documentId, eventType, payload) {
  webSocketManager.broadcastDocumentUpdate(documentId, eventType, payload || {});
}

/**
 * Broadcast to organization room only.
 * @param {string} organizationId
 * @param {string} eventType
 * @param {object} payload
 */
function broadcastOrganizationUpdate(organizationId, eventType, payload) {
  webSocketManager.broadcastOrganizationUpdate(organizationId, eventType, payload || {});
}

/**
 * Broadcast to document room, then to organization room if organizationId is provided.
 * Use for document events that should also notify org subscribers (e.g. document-vote, document-created).
 * @param {string} documentId
 * @param {string|null} organizationId - If null, only document room is notified.
 * @param {string} eventType
 * @param {object} payload
 */
function broadcastDocumentAndOrg(documentId, organizationId, eventType, payload) {
  webSocketManager.broadcastDocumentUpdate(documentId, eventType, payload || {});
  if (organizationId) {
    webSocketManager.broadcastOrganizationUpdate(organizationId, eventType, { documentId, ...(payload || {}) });
  }
}

module.exports = {
  broadcastDocumentUpdate,
  broadcastOrganizationUpdate,
  broadcastDocumentAndOrg
};
