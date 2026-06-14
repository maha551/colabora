const webSocketManager = require('../../server/modules/websocket');

describe('WebSocket Module Tests', () => {
  test('should initialize WebSocket manager', () => {
    expect(webSocketManager).toBeDefined();
    expect(webSocketManager.initialize).toBeDefined();
  });

  test('should have broadcast methods', () => {
    expect(typeof webSocketManager.broadcastDocumentUpdate).toBe('function');
    expect(typeof webSocketManager.broadcastProposalUpdate).toBe('function');
    expect(typeof webSocketManager.broadcastVoteUpdate).toBe('function');
    expect(typeof webSocketManager.broadcastCommentUpdate).toBe('function');
    expect(typeof webSocketManager.broadcastOrganizationUpdate).toBe('function');
    expect(typeof webSocketManager.broadcastMeetingUpdate).toBe('function');
  });

  test('should handle broadcast without server initialized', () => {
    // Should not throw even if server not initialized
    expect(() => {
      webSocketManager.broadcastDocumentUpdate('doc-id', 'update', {});
    }).not.toThrow();
    expect(() => {
      webSocketManager.broadcastMeetingUpdate('meeting-id', 'minutes-event-added', { event: { id: 'event-1' } });
    }).not.toThrow();
  });

  test('should track connected clients', () => {
    // WebSocket manager should have methods to track clients
    expect(webSocketManager).toBeDefined();
    expect(webSocketManager.connectedClients).toBeDefined();
    expect(webSocketManager.connectedClients instanceof Map).toBe(true);
  });
});

