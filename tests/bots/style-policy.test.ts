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
    const policy = createStylePolicy(style);
    const pick = policy.pick(actions, () => 0);
    expect(pick).toBe(expectedId);
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
});
