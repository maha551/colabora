/**
 * Title resolution for MobilePageTitle (mirrors component logic).
 * Priority: focusTitle > focusTitleOverride > branding org title > route title
 */
function resolveMobilePageTitle(input: {
  focusTitle: string | null;
  focusTitleOverride?: string | null;
  title?: string;
  organization?: { brandingTitle?: string; name?: string } | null;
}): string | undefined {
  const { focusTitle, focusTitleOverride, title, organization } = input;
  return (
    focusTitle ||
    focusTitleOverride ||
    (organization
      ? organization.brandingTitle || organization.name || title
      : title) ||
    undefined
  );
}

describe('MobilePageTitle title resolution', () => {
  it('prefers focusTitle from chrome context', () => {
    expect(
      resolveMobilePageTitle({
        focusTitle: 'Doc Title',
        focusTitleOverride: 'Override',
        title: 'Route',
      })
    ).toBe('Doc Title');
  });

  it('falls back to focusTitleOverride', () => {
    expect(
      resolveMobilePageTitle({
        focusTitle: null,
        focusTitleOverride: 'Meeting Notes',
        title: 'Route',
      })
    ).toBe('Meeting Notes');
  });

  it('uses organization branding before route title', () => {
    expect(
      resolveMobilePageTitle({
        focusTitle: null,
        title: 'Organizations',
        organization: { brandingTitle: 'Acme Board', name: 'Acme' },
      })
    ).toBe('Acme Board');
  });

  it('uses route title when no focus or org branding', () => {
    expect(
      resolveMobilePageTitle({
        focusTitle: null,
        title: 'Documents',
      })
    ).toBe('Documents');
  });
});
