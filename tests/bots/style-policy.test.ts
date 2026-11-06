import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStylePolicy, type ActionOption } from './style-policy';

const actions: ActionOption[] = [
  { id: 'strike', family: 'savage' },
  { id: 'comfort', family: 'kind' },
  { id: 'probe', family: 'mixed' },
  { id: 'wait', family: 'noop' },
];

function majorityPick(
  style: 'savage' | 'kind' | 'mixed',
  opts: ActionOption[],
  draws = 200,
): Record<string, number> {
  const policy = createStylePolicy(style);
  const counts: Record<string, number> = {};
  // Deterministic cover of [0,1) so weights drive frequencies.
  for (let i = 0; i < draws; i++) {
    const id = policy.pick(opts, () => (i + 0.5) / draws);
    if (id) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

describe('style-policy', () => {
  it('never branches on archetype id in source', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(dir, 'style-policy.ts'), 'utf8');
    expect(src).not.toMatch(/archetypeId|marrow|ivy_quill|basilisk/);
  });

  it.each([
    ['savage', 'strike'],
    ['kind', 'comfort'],
    ['mixed', 'probe'],
  ] as const)('%s style prefers matching family when present', (style, expectedId) => {
    const counts = majorityPick(style, actions);
    const preferred = counts[expectedId] ?? 0;
    const others = Object.entries(counts)
      .filter(([id]) => id !== expectedId)
      .map(([, n]) => n);
    expect(preferred).toBeGreaterThan(Math.max(0, ...others));
  });

  it('returns null when listActions is empty', () => {
    const policy = createStylePolicy('savage');
    expect(policy.pick([], () => 0)).toBeNull();
  });

  it('falls back to any listed action when preferred family is absent', () => {
    const onlyKind: ActionOption[] = [{ id: 'comfort', family: 'kind' }];
    const policy = createStylePolicy('savage');
    expect(policy.pick(onlyKind, () => 0)).toBe('comfort');
  });

  it('uses rng to select among equal-weight candidates', () => {
    const twins: ActionOption[] = [
      { id: 'a', family: 'savage' },
      { id: 'b', family: 'savage' },
    ];
    const policy = createStylePolicy('savage');
    expect(policy.pick(twins, () => 0)).toBe('a');
    expect(policy.pick(twins, () => 0.99)).toBe('b');
  });

  it('kind policy sometimes picks rest (advance:dawn) among kind+rest actions', () => {
    const mixedRest: ActionOption[] = [
      { id: 'comfort', family: 'kind' },
      { id: 'advance:dawn', family: 'rest' },
      { id: 'travel:spine', family: 'travel' },
    ];
    const counts = majorityPick('kind', mixedRest, 300);
    expect(counts['advance:dawn'] ?? 0).toBeGreaterThan(0);
    expect(counts['travel:spine'] ?? 0).toBeGreaterThan(0);
    // kind still prefers kind over rest/travel
    expect(counts['comfort'] ?? 0).toBeGreaterThan(counts['advance:dawn'] ?? 0);
  });

  it('savage can still prefer savage methods over rest/travel', () => {
    const withRest: ActionOption[] = [
      { id: 'strike', family: 'savage' },
      { id: 'advance:dawn', family: 'rest' },
      { id: 'travel:spine', family: 'travel' },
    ];
    const counts = majorityPick('savage', withRest, 300);
    expect(counts['strike'] ?? 0).toBeGreaterThan(counts['advance:dawn'] ?? 0);
    expect(counts['strike'] ?? 0).toBeGreaterThan(counts['travel:spine'] ?? 0);
  });

  it('pick is weighted-random, not max-only (rest can win against higher kind)', () => {
    const policy = createStylePolicy('kind');
    const opts: ActionOption[] = [
      { id: 'comfort', family: 'kind' }, // weight 10
      { id: 'advance:dawn', family: 'rest' }, // weight 5
    ];
    // Total 15; rest band is [10/15, 1) ≈ [0.666..., 1)
    expect(policy.pick(opts, () => 0.7)).toBe('advance:dawn');
    expect(policy.pick(opts, () => 0.1)).toBe('comfort');
  });
});
