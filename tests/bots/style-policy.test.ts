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
  ctx?: { spark?: number },
): Record<string, number> {
  const policy = createStylePolicy(style);
  const counts: Record<string, number> = {};
  // Deterministic cover of [0,1) so weights drive frequencies.
  for (let i = 0; i < draws; i++) {
    const id = policy.pick(opts, () => (i + 0.5) / draws, ctx);
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

  it('low spark (≤40) makes rest win often vs kind:10', () => {
    const opts: ActionOption[] = [
      { id: 'comfort', family: 'kind' },
      { id: 'advance:dawn', family: 'rest' },
    ];
    const counts = majorityPick('kind', opts, 300, { spark: 40 });
    // base kind=10, rest=5; ×8 → rest=40 > kind → rest majority
    expect(counts['advance:dawn'] ?? 0).toBeGreaterThan(counts['comfort'] ?? 0);
  });

  it('spark ≤20 multiplies rest harder than ≤40', () => {
    const opts: ActionOption[] = [
      { id: 'comfort', family: 'kind' },
      { id: 'advance:dawn', family: 'rest' },
    ];
    const at40 = majorityPick('kind', opts, 300, { spark: 40 });
    const at20 = majorityPick('kind', opts, 300, { spark: 20 });
    expect(at20['advance:dawn'] ?? 0).toBeGreaterThanOrEqual(at40['advance:dawn'] ?? 0);
    // ×20 rest=100 vs kind=10 → rest dominates heavily
    expect(at20['advance:dawn'] ?? 0).toBeGreaterThan((at20['comfort'] ?? 0) * 3);
  });

  it('high or undefined spark keeps prior kind preference over rest', () => {
    const opts: ActionOption[] = [
      { id: 'comfort', family: 'kind' },
      { id: 'advance:dawn', family: 'rest' },
      { id: 'travel:spine', family: 'travel' },
    ];
    const high = majorityPick('kind', opts, 300, { spark: 80 });
    const undef = majorityPick('kind', opts, 300);
    expect(high['comfort'] ?? 0).toBeGreaterThan(high['advance:dawn'] ?? 0);
    expect(undef['comfort'] ?? 0).toBeGreaterThan(undef['advance:dawn'] ?? 0);
  });

  it('savage still prefers savage at high spark with rest/travel present', () => {
    const opts: ActionOption[] = [
      { id: 'strike', family: 'savage' },
      { id: 'advance:dawn', family: 'rest' },
      { id: 'travel:spine', family: 'travel' },
    ];
    const counts = majorityPick('savage', opts, 300, { spark: 90 });
    expect(counts['strike'] ?? 0).toBeGreaterThan(counts['advance:dawn'] ?? 0);
    expect(counts['strike'] ?? 0).toBeGreaterThan(counts['travel:spine'] ?? 0);
  });

  it('weighted-random still allows non-rest picks at low spark', () => {
    const policy = createStylePolicy('kind');
    const opts: ActionOption[] = [
      { id: 'comfort', family: 'kind' }, // 10
      { id: 'advance:dawn', family: 'rest' }, // 5×8=40 at spark 40
    ];
    // total 50; kind band [0, 10/50), rest [10/50, 1)
    expect(policy.pick(opts, () => 0.1, { spark: 40 })).toBe('comfort');
    expect(policy.pick(opts, () => 0.5, { spark: 40 })).toBe('advance:dawn');
  });

  it('spark ≤25 hard-prefers rest when a rest action exists', () => {
    const policy = createStylePolicy('savage');
    const opts: ActionOption[] = [
      { id: 'strike', family: 'savage' },
      { id: 'advance:dawn', family: 'rest' },
      { id: 'travel:spine', family: 'travel' },
    ];
    for (let i = 0; i < 20; i++) {
      expect(policy.pick(opts, () => i / 20, { spark: 25 })).toBe('advance:dawn');
      expect(policy.pick(opts, () => i / 20, { spark: 15 })).toBe('advance:dawn');
      expect(policy.pick(opts, () => i / 20, { spark: 1 })).toBe('advance:dawn');
    }
    // Above the hard-prefer band, savage can still win at high rolls toward savage weight.
    expect(policy.pick(opts, () => 0.01, { spark: 26 })).toBe('strike');
  });

});
