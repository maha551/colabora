import { getDocumentOwnerStripeColor } from '../../client/src/components/documentOwnerStripe';
import { DEFAULT_ORGANIZATION_COLOR } from '../../client/src/lib/constants';
import { getUserColor } from '../../client/src/lib/userColors';
import type { Document, Organization } from '../../client/src/types';

describe('getDocumentOwnerStripeColor', () => {
  const org = {
    id: 'org-1',
    name: 'Test Org',
    brandingColor: '#9333ea',
  } as Organization;

  const userOwnedDoc = {
    id: 'doc-1',
    ownerId: 'user-1',
    owner: { id: 'user-1', name: 'Alice', type: 'user' as const },
    ownershipType: 'personal' as const,
  } as Document;

  const orgOwnedDoc = {
    id: 'doc-2',
    ownerId: 'org-1',
    owner: { id: 'org-1', name: 'Test Org', type: 'organization' as const },
    ownershipType: 'organizational' as const,
    organizationId: 'org-1',
  } as Document;

  it('uses organization branding color when owner is organization', () => {
    expect(getDocumentOwnerStripeColor(orgOwnedDoc, org)).toBe('#9333ea');
  });

  it('falls back to default org color when organization prop is missing', () => {
    expect(getDocumentOwnerStripeColor(orgOwnedDoc)).toBe(DEFAULT_ORGANIZATION_COLOR);
  });

  it('uses org branding for organizational ownership even if owner type is user', () => {
    const doc = {
      ...userOwnedDoc,
      ownershipType: 'organizational' as const,
      organizationId: 'org-1',
    } as Document;
    expect(getDocumentOwnerStripeColor(doc, org)).toBe('#9333ea');
  });

  it('uses user color for personal user-owned documents', () => {
    expect(getDocumentOwnerStripeColor(userOwnedDoc)).toBe(getUserColor('user-1'));
  });
});
