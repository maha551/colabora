import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Document } from '../types';
import { documentsApi, type DeletionStatusResponse } from '../lib/api';
import { logger } from '../lib/logger';

export interface UseDeletionStatusesOptions {
  enabled?: boolean;
}

/**
 * Fetch deletion vote status for documents with an active deletion vote deadline.
 */
export function useDeletionStatuses(
  documents: Document[],
  options: UseDeletionStatusesOptions = {}
) {
  const { enabled = true } = options;

  const docsWithDeletion = useMemo(
    () =>
      documents.filter(
        (d) =>
          d.deletionProposedAt &&
          d.deletionVoteDeadline &&
          new Date(d.deletionVoteDeadline) > new Date()
      ),
    [documents]
  );

  const [deletionStatuses, setDeletionStatuses] = useState<Record<string, DeletionStatusResponse>>({});
  const [loading, setLoading] = useState(false);

  const refreshDeletionStatuses = useCallback(async () => {
    if (!enabled || docsWithDeletion.length === 0) {
      setDeletionStatuses({});
      return;
    }

    setLoading(true);
    const statuses: Record<string, DeletionStatusResponse> = {};
    try {
      await Promise.all(
        docsWithDeletion.map(async (doc) => {
          try {
            const status = (await documentsApi.getDeletionStatus(doc.id)) as DeletionStatusResponse;
            statuses[doc.id] = status;
          } catch (error) {
            logger.error('Failed to fetch deletion status', { documentId: doc.id, error });
          }
        })
      );
      setDeletionStatuses(statuses);
    } catch (error) {
      logger.error('Error fetching deletion statuses', error);
    } finally {
      setLoading(false);
    }
  }, [enabled, docsWithDeletion]);

  useEffect(() => {
    if (!enabled) return;
    refreshDeletionStatuses();
  }, [enabled, docsWithDeletion.length, refreshDeletionStatuses]);

  return {
    deletionStatuses,
    loadingDeletionStatuses: loading,
    refreshDeletionStatuses,
  };
}
