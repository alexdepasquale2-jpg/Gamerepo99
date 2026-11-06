import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

describe('data gate', () => {
  it('validate-data.mjs exits 0', () => {
    const out = execFileSync('node', ['scripts/validate-data.mjs'], { encoding: 'utf8' });
    expect(out).toContain('OK');
  });
});
