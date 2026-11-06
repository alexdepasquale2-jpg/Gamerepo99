/** Map repo BAKED_SHEETS paths (assets/...) to Vite publicDir URLs. */
export function toPublicUrl(repoPath: string): string {
  const trimmed = repoPath.replace(/^\/+/, '');
  if (trimmed.startsWith('assets/')) return '/' + trimmed.slice('assets/'.length);
  return '/' + trimmed;
}
