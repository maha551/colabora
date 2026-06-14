import {
  getOrganizationInitials,
  resolveOrganizationAvatarData,
} from '../../client/src/utils/organizationUtils';

describe('getOrganizationInitials', () => {
  it('returns ?? for empty names', () => {
    expect(getOrganizationInitials('')).toBe('??');
    expect(getOrganizationInitials('   ')).toBe('??');
  });

  it('uses first letters of first two words', () => {
    expect(getOrganizationInitials('Test Org')).toBe('TO');
    expect(getOrganizationInitials('Colabora Democratic')).toBe('CD');
  });

  it('uses first two letters for single-word names', () => {
    expect(getOrganizationInitials('testO')).toBe('TE');
    expect(getOrganizationInitials('A')).toBe('AA');
  });
});

describe('resolveOrganizationAvatarData', () => {
  it('returns organization fields when present', () => {
    expect(
      resolveOrganizationAvatarData({
        name: 'Test Org',
        brandingColor: '#ff0000',
        brandingLogoUrl: 'https://example.com/logo.png',
      })
    ).toEqual({
      name: 'Test Org',
      brandingColor: '#ff0000',
      brandingLogoUrl: 'https://example.com/logo.png',
    });
  });

  it('falls back to provided name when organization is missing', () => {
    expect(resolveOrganizationAvatarData(null, 'Fallback Org')).toEqual({
      name: 'Fallback Org',
    });
  });
});
