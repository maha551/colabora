import { useCallback } from 'react';
import type { BaseProposal } from '../../components/shared/proposalTypes';
import { documentsApi, documentTreeProposalsApi } from '../../lib/api';
import { logger } from '../../lib/logger';
import { transformTreeProposal, transformDeletionProposal } from './transforms';

export function useTreeProposals(
  organizationId: string | undefined,
  documentId: string | undefined,
  currentUserId: string | undefined
): { fetchTreeAndDeletionProposals: () => Promise<BaseProposal[]> } {
  const fetchTreeAndDeletionProposals = useCallback(async (): Promise<BaseProposal[]> => {
    const all: BaseProposal[] = [];

    if (organizationId) {
      try {
        const docsResponse = await documentsApi.getDocuments();
        const orgDocs = docsResponse.documents.filter((doc) => doc.organizationId === organizationId);
        for (const doc of orgDocs) {
          try {
            const treeProposalsResponse = await documentTreeProposalsApi.getProposals(doc.id);
            const treeProposals = treeProposalsResponse.proposals || [];
            all.push(...treeProposals.map((tp) => transformTreeProposal(tp, currentUserId)));
          } catch {
            // Skip documents without tree proposals
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch tree proposals', err);
      }

      try {
        const docsResponse = await documentsApi.getDocuments();
        const docsWithDeletion = docsResponse.documents.filter(
          (doc) => doc.organizationId === organizationId && doc.deletionProposedAt
        );
        docsWithDeletion.forEach((doc) => {
          const deletionProposal = transformDeletionProposal(doc, currentUserId);
          if (deletionProposal) all.push(deletionProposal);
        });
      } catch (err) {
        logger.warn('Failed to fetch deletion proposals', err);
      }
    }

    if (documentId && !organizationId) {
      try {
        const treeProposalsResponse = await documentTreeProposalsApi.getProposals(documentId);
        const treeProposals = treeProposalsResponse.proposals || [];
        all.push(...treeProposals.map((tp) => transformTreeProposal(tp, currentUserId)));
      } catch (err) {
        logger.warn('Failed to fetch tree proposals for document', err);
      }
      try {
        const docResponse = await documentsApi.getDocument(documentId);
        const deletionProposal = transformDeletionProposal(docResponse.document, currentUserId);
        if (deletionProposal) all.push(deletionProposal);
      } catch (err) {
        logger.warn('Failed to fetch deletion proposal', err);
      }
    }

    return all;
  }, [organizationId, documentId, currentUserId]);
  return { fetchTreeAndDeletionProposals };
}
