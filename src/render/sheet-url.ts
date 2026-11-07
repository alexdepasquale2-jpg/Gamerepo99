/** Map repo BAKED_SHEETS paths (assets/...) to Vite publicDir URLs (respects the build's base path). */
const BASE: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export function toPublicUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\/+/, '');
  return BASE + (trimmed.startsWith('assets/') ? trimmed.slice('assets/'.length) : trimmed);
}
