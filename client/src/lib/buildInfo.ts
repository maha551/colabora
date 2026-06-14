const normalizeSha = (value: string | undefined): string => {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'unknown') return '';
  return trimmed.slice(0, 7);
};

export const BUILD_GIT_SHA =
  normalizeSha(import.meta.env.VITE_GIT_SHA) || (import.meta.env.DEV ? 'dev' : 'unknown');

export const BUILD_TIME = import.meta.env.VITE_BUILD_TIME?.trim() || '';

export function getBuildVersionLabel(): string {
  return BUILD_GIT_SHA;
}

export function getBuildVersionTitle(): string | undefined {
  if (!BUILD_TIME) return undefined;
  const parsed = new Date(BUILD_TIME);
  if (Number.isNaN(parsed.getTime())) return BUILD_TIME;
  return `Built ${parsed.toLocaleString()}`;
}
