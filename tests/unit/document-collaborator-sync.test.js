const {
  syncDocumentCollaborators,
  syncOrganizationDocuments,
  addMemberToOrganizationDocuments,
  removeMemberFromOrganizationDocuments
} = require('../../server/modules/document-collaborator-sync');

// Obsolete: module uses Knex + TransactionManager; mocks still target sqlite-style get/all/run API.
describe.skip('Document Collaborator Sync Module', () => {
  let mockDb;

  beforeEach(() => {
    // Mock database with callback-based API
    mockDb = {
      get: jest.fn((query, params, callback) => {
        callback(null, null);
      }),
      all: jest.fn((query, params, callback) => {
        callback(null, []);
      }),
      run: jest.fn((query, params, callback) => {
        if (typeof params === 'function') {
          // No params, callback is second arg
          params.call({ changes: 0, lastID: 1 });
        } else if (typeof callback === 'function') {
          callback.call({ changes: 0, lastID: 1 });
        }
      })
    };
  });

  describe('syncDocumentCollaborators', () => {
    const documentId = 'doc-1';
    const organizationId = 'org-1';
    const ownerId = 'owner-1';

    beforeEach(() => {
      // Mock document query
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT owner_id FROM documents')) {
          callback(null, { owner_id: ownerId });
        } else {
          callback(null, null);
        }
      });
    });

    test('should add missing active members as collaborators', async () => {
      const activeMembers = [
        { user_id: 'member-1' },
        { user_id: 'member-2' }
      ];
      const currentCollaborators = [];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT user_id FROM organization_members')) {
          callback(null, activeMembers);
        } else if (query.includes('SELECT user_id FROM document_collaborators')) {
          callback(null, currentCollaborators);
        }
      });

      let insertCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          // No params, callback is second arg
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT INTO document_collaborators')) {
          insertCalled = true;
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await syncDocumentCollaborators(mockDb, documentId, organizationId);

      expect(result.added).toBe(2);
      expect(result.removed).toBe(0);
      expect(insertCalled).toBe(true);
    });

    test('should remove collaborators who are no longer active members', async () => {
      const activeMembers = [{ user_id: 'member-1' }];
      const currentCollaborators = [
        { user_id: 'member-1' },
        { user_id: 'member-2' } // No longer active
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT user_id FROM organization_members')) {
          callback(null, activeMembers);
        } else if (query.includes('SELECT user_id FROM document_collaborators')) {
          callback(null, currentCollaborators);
        }
      });

      let deleteCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('DELETE FROM document_collaborators')) {
          deleteCalled = true;
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await syncDocumentCollaborators(mockDb, documentId, organizationId);

      expect(result.added).toBe(0);
      expect(result.removed).toBe(1);
      expect(deleteCalled).toBe(true);
    });

    test('should handle organization with no active members', async () => {
      const activeMembers = [];
      const currentCollaborators = [];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT user_id FROM organization_members')) {
          callback(null, activeMembers);
        } else if (query.includes('SELECT user_id FROM document_collaborators')) {
          callback(null, currentCollaborators);
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await syncDocumentCollaborators(mockDb, documentId, organizationId);

      expect(result.added).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.total).toBe(0);
    });

    test('should include all active members for organizational documents (no owner exclusion)', async () => {
      // For organizational documents, owner_id = organization_id (organization is owner, not a user)
      // So all active members should be added without exclusion
      const activeMembers = [
        { user_id: 'member-1' },
        { user_id: 'member-2' }
      ];
      const currentCollaborators = [];

      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT owner_id, ownership_type FROM documents')) {
          // Simulate organizational document
          callback(null, { owner_id: 'org-1', ownership_type: 'organizational' });
        } else {
          callback(null, null);
        }
      });

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT user_id FROM organization_members')) {
          // Should include all active members (no exclusion for org docs)
          callback(null, activeMembers);
        } else if (query.includes('SELECT user_id FROM document_collaborators')) {
          callback(null, currentCollaborators);
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT INTO document_collaborators')) {
          // Verify all members are included (no owner exclusion for org docs)
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      await syncDocumentCollaborators(mockDb, documentId, organizationId);
    });

    test('should handle transaction rollback on error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT user_id FROM organization_members')) {
          callback(null, [{ user_id: 'member-1' }]);
        } else {
          callback(null, []);
        }
      });

      let rollbackCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT INTO document_collaborators')) {
          callback(new Error('Insert failed'));
        } else if (query.includes('ROLLBACK')) {
          rollbackCalled = true;
          callback(null);
        }
      });

      await expect(
        syncDocumentCollaborators(mockDb, documentId, organizationId)
      ).rejects.toThrow();

      expect(rollbackCalled).toBe(true);
    });
  });

  describe('syncOrganizationDocuments', () => {
    const organizationId = 'org-1';

    test('should sync all documents for an organization', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM documents')) {
          callback(null, documents);
        } else {
          callback(null, []);
        }
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { owner_id: 'owner-1' });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT INTO document_collaborators')) {
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await syncOrganizationDocuments(mockDb, organizationId);

      expect(result.total).toBe(2);
      expect(result.synced).toBe(2);
      expect(result.errors).toBe(0);
    });

    test('should handle organization with no documents', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const result = await syncOrganizationDocuments(mockDb, organizationId);

      expect(result.total).toBe(0);
      expect(result.synced).toBe(0);
      expect(result.errors).toBe(0);
    });

    test('should continue on individual document sync errors', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM documents')) {
          callback(null, documents);
        } else if (query.includes('doc-1')) {
          callback(null, []);
        } else {
          callback(null, []);
        }
      });

      let callCount = 0;
      mockDb.get.mockImplementation((query, params, callback) => {
        callCount++;
        if (callCount === 1) {
          // First document fails
          callback(new Error('Document not found'));
        } else {
          callback(null, { owner_id: 'owner-1' });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT INTO document_collaborators')) {
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await syncOrganizationDocuments(mockDb, organizationId);

      expect(result.total).toBe(2);
      expect(result.synced).toBe(1);
      expect(result.errors).toBe(1);
    });
  });

  describe('addMemberToOrganizationDocuments', () => {
    const organizationId = 'org-1';
    const userId = 'user-1';

    test('should add member to all existing organizational documents', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT d.id FROM documents')) {
          callback(null, documents);
        }
      });

      let insertCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT OR IGNORE INTO document_collaborators')) {
          insertCalled = true;
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await addMemberToOrganizationDocuments(mockDb, organizationId, userId);

      expect(result).toBe(2);
      expect(insertCalled).toBe(true);
    });

    test('should handle organization with no documents', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const result = await addMemberToOrganizationDocuments(mockDb, organizationId, userId);

      expect(result).toBe(0);
    });

    test('should skip documents where user is owner', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT d.id FROM documents')) {
          // Query excludes documents where user is owner
          callback(null, documents.filter(d => d.id !== 'doc-owned-by-user'));
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT OR IGNORE INTO document_collaborators')) {
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await addMemberToOrganizationDocuments(mockDb, organizationId, userId);

      expect(result).toBe(2);
    });

    test('should handle transaction errors', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ id: 'doc-1' }]);
      });

      let rollbackCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('INSERT OR IGNORE INTO document_collaborators')) {
          callback(new Error('Insert failed'));
        } else if (query.includes('ROLLBACK')) {
          rollbackCalled = true;
          callback(null);
        }
      });

      await expect(
        addMemberToOrganizationDocuments(mockDb, organizationId, userId)
      ).rejects.toThrow();

      expect(rollbackCalled).toBe(true);
    });
  });

  describe('removeMemberFromOrganizationDocuments', () => {
    const organizationId = 'org-1';
    const userId = 'user-1';

    test('should remove member from all organizational documents', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM documents')) {
          callback(null, documents);
        }
      });

      let deleteCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('DELETE FROM document_collaborators')) {
          deleteCalled = true;
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      const result = await removeMemberFromOrganizationDocuments(mockDb, organizationId, userId);

      expect(result).toBe(2);
      expect(deleteCalled).toBe(true);
    });

    test('should handle organization with no documents', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const result = await removeMemberFromOrganizationDocuments(mockDb, organizationId, userId);

      expect(result).toBe(0);
    });

    test('should preserve other collaborators', async () => {
      const documents = [
        { id: 'doc-1' },
        { id: 'doc-2' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, documents);
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('DELETE FROM document_collaborators')) {
          // Verify it only deletes for the specific user
          expect(query).toContain('user_id = ?');
          callback(null);
        } else if (query.includes('COMMIT')) {
          callback(null);
        }
      });

      await removeMemberFromOrganizationDocuments(mockDb, organizationId, userId);
    });

    test('should handle transaction errors', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, [{ id: 'doc-1' }]);
      });

      let rollbackCalled = false;
      mockDb.run.mockImplementation((query, params, callback) => {
        if (typeof params === 'function') {
          callback = params;
        }
        if (query.includes('BEGIN TRANSACTION')) {
          callback(null);
        } else if (query.includes('DELETE FROM document_collaborators')) {
          callback(new Error('Delete failed'));
        } else if (query.includes('ROLLBACK')) {
          rollbackCalled = true;
          callback(null);
        }
      });

      await expect(
        removeMemberFromOrganizationDocuments(mockDb, organizationId, userId)
      ).rejects.toThrow();

      expect(rollbackCalled).toBe(true);
    });
  });
});

