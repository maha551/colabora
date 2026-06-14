/**
 * Organization utility functions
 */

/**
 * Get organization initials from name.
 * - If name has 2+ words: first letter of first two words (e.g. "Test Org" -> "TO")
 * - If name has 1 word: first two letters (e.g. "testO" -> "TE")
 * - If name is empty: "??"
 */
export function getOrganizationInitials(name: string): string {
  if (!name || name.trim().length === 0) {
    return '??';
  }

  const words = name.trim().split(/\s+/).filter((word) => word.length > 0);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  if (words.length === 1) {
    const word = words[0];
    return word.length >= 2
      ? word.substring(0, 2).toUpperCase()
      : (word[0] + word[0]).toUpperCase();
  }

  return '??';
}

export interface OrganizationAvatarData {
  name: string;
  brandingColor?: string;
  brandingLogoUrl?: string;
}

/** Build avatar data from a full/partial org record or a fallback name. */
export function resolveOrganizationAvatarData(
  organization?: OrganizationAvatarData | null,
  fallbackName = 'Organization'
): OrganizationAvatarData {
  if (organization?.name) {
    return {
      name: organization.name,
      brandingColor: organization.brandingColor,
      brandingLogoUrl: organization.brandingLogoUrl,
    };
  }
  return { name: fallbackName };
}
