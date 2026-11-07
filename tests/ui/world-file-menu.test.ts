import { describe, expect, it } from 'vitest';
import { createPlaySession, type PlaySession } from '../../src/sim';
import { exportWorldFile, importWorldText } from '../../src/ui/menus/world-file-menu';

function fresh(): PlaySession {
  const s = createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }) as PlaySession;
  s.start({ seed: 42, archetypeId: 'marrow' });
  return s;
}

describe('world file menu helpers', () => {
  it('exports a named file and re-imports to the same contentHash', () => {
    const s = fresh();
    s.tick();
    const f = exportWorldFile(s)!;
    expect(f.filename).toMatch(/^hearthfall-42-\d+\.world\.json$/);
    const t = fresh();
    expect(importWorldText(t, f.text).ok).toBe(true);
    const again = JSON.parse(exportWorldFile(t)!.text);
    expect(again.contentHash).toBe(JSON.parse(f.text).contentHash);
  });

  it('refuses corrupt, foreign, and newer files without touching state', () => {
    const s = fresh();
    const before = s.snapshot().fingerprint;
    const good = JSON.parse(exportWorldFile(s)!.text);
    for (const text of ['{nope', JSON.stringify({ hello: 1 }), JSON.stringify({ ...good, version: 999 }), JSON.stringify({ ...good, contentHash: 'bad' })]) {
      const r = importWorldText(s, text);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.length).toBeGreaterThan(5);
    }
    expect(s.snapshot().fingerprint).toBe(before);
  });
});
