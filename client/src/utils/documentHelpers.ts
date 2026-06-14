/**
 * Document utility functions
 * Shared helpers for document operations
 */

import type { Document, Proposal, User } from '../types';

/**
 * Returns collaborators eligible to vote on a document.
 * Excludes the organization when it owns the document (organizational docs).
 * Organizations cannot vote; only users (members) can.
 */
export function getVotingEligibleCollaborators(document: Document): User[] {
  const collaborators: User[] = [];
  // Only include owner if it's a user (not an organization)
  if (document.owner?.type !== 'organization' && document.owner) {
    collaborators.push({
      id: document.owner.id,
      name: document.owner.name,
      email: document.owner.email ?? '',
      avatar: document.owner.avatar,
    });
  }
  document.collaborators.forEach(c => {
    if (c.user && !collaborators.some(u => u.id === c.user!.id)) {
      collaborators.push(c.user);
    }
  });
  return collaborators;
}

/**
 * Finds a proposal and its parent paragraph in a document
 * @param document - The document to search
 * @param proposalId - The proposal ID to find
 * @returns Object with paragraphId and proposal, or null if not found
 */
export function findProposalAndParagraph(
  document: Document,
  proposalId: string
): { paragraphId: string; proposal: Proposal } | null {
  for (const paragraph of document.paragraphs) {
    const proposal = paragraph.proposals.find(p => p.id === proposalId);
    if (proposal) {
      return { paragraphId: paragraph.id, proposal };
    }
  }
  return null;
}
