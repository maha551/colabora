import type { Document, Organization } from '../types';
import { DEFAULT_ORGANIZATION_COLOR } from '../lib/constants';
import { getUserColor } from '../lib/userColors';

/** Left stripe color on document cards: org branding for org-owned docs, user color otherwise. */
export function getDocumentOwnerStripeColor(
  document: Document,
  organization?: Organization | null
): string {
  const isOrganizationOwner =
    document.owner.type === 'organization' || document.ownershipType === 'organizational';

  if (isOrganizationOwner) {
    return organization?.brandingColor ?? DEFAULT_ORGANIZATION_COLOR;
  }

  return getUserColor(document.owner.id);
}
