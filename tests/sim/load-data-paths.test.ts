import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/sim/load-data';

describe('loadData fabric dialogue paths', () => {
  it('loads line-fragments from dialogue/fragments/ folder', () => {
    const data = loadData();
    expect(data.lineFragments?.fragments?.length).toBeGreaterThan(50);
    expect(
      (data.lines as { deprecated?: boolean })?.deprecated === true ||
        data.lineFragments?.canonical === true,
    ).toBe(true);
  });

  it('indexes voice-anchors, reaction-curves, and voice-constraints', () => {
    const data = loadData();
    expect(data.voiceAnchors?.anchors?.length).toBeGreaterThan(0);
    expect(data.reactionCurves?.curves?.length).toBeGreaterThan(0);
    expect(data.voiceConstraints?.constraints?.length).toBeGreaterThan(0);
  });
});
