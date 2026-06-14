/**
 * Vote utility helpers.
 *
 * getVoteTypeIconName returns a Lucide icon name for a given vote type so callers
 * can render <Icon name={getVoteTypeIconName(voteType)} /> rather than emoji strings.
 * All returned names are registered in lucideIcons.ts.
 */

/**
 * Returns the Lucide icon name that best represents the given org vote type.
 */
export function getVoteTypeIconName(voteType: string): string {
  switch (voteType) {
    case 'policy':                  return 'FileText';
    case 'election':                return 'Vote';
    case 'spending':                return 'TrendingUp';
    case 'document':
    case 'document_change':
    case 'document_amendment_adoption': return 'FileEdit';
    case 'membership':              return 'Users';
    case 'dissolution':             return 'Archive';
    case 'representative_removal':  return 'UserX';
    default:                        return 'Vote';
  }
}
