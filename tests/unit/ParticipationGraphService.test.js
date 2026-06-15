process.env.NODE_ENV = 'test';

const ParticipationGraphService = require('../../server/services/ParticipationGraphService');

describe('ParticipationGraphService', () => {
  describe('computeTreePath', () => {
    it('builds path from parent path and org id', () => {
      expect(ParticipationGraphService.computeTreePath('/root', 'child')).toBe('/root/child');
      expect(ParticipationGraphService.computeTreePath('', 'root')).toBe('/root');
    });
  });

  describe('parseAncestorIdsFromPath', () => {
    it('returns ancestor ids excluding self', () => {
      expect(
        ParticipationGraphService.parseAncestorIdsFromPath('/a/b/c', 'c')
      ).toEqual(['a', 'b']);
    });

    it('returns empty for root org', () => {
      expect(
        ParticipationGraphService.parseAncestorIdsFromPath('/a', 'a')
      ).toEqual([]);
    });
  });

  describe('validateNoCycle', () => {
    it('rejects self-parent', async () => {
      const db = {};
      await expect(
        ParticipationGraphService.validateNoCycle(db, 'org-a', 'org-a')
      ).rejects.toMatchObject({ code: 'CYCLE_DETECTED' });
    });

    it('rejects when new parent is a descendant', async () => {
      const TransactionManager = require('../../server/database/services/TransactionManager');
      const originalQuery = TransactionManager.query;
      TransactionManager.query = jest.fn()
        .mockResolvedValueOnce({ primary_parent_id: 'org-c' })
        .mockResolvedValueOnce({ primary_parent_id: 'org-a' })
        .mockResolvedValueOnce({ primary_parent_id: null });

      try {
        await expect(
          ParticipationGraphService.validateNoCycle({}, 'org-a', 'org-b')
        ).rejects.toMatchObject({ code: 'CYCLE_DETECTED' });
      } finally {
        TransactionManager.query = originalQuery;
      }
    });
  });

  describe('initializeRootOrgFields', () => {
    it('sets root tree metadata', () => {
      const fields = ParticipationGraphService.initializeRootOrgFields('org-1');
      expect(fields).toEqual({
        primary_parent_id: null,
        org_kind: 'standard',
        participation_profile: 'classical_committee',
        tree_depth: 0,
        tree_path: '/org-1',
        participation_graph_root_id: 'org-1',
      });
    });
  });
});
