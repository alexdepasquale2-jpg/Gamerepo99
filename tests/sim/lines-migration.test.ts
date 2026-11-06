import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadData } from '../../src/sim/load-data';
import { pickFixedReactionLine, type ReactionPickCtx } from '../../src/sim/method-reactions';
import type { SimState } from '../../src/sim/types/runtime';

type ExpectedPeople = Record<
  string,
  { methods?: Record<string, string>; marks?: Record<string, string> }
>;

function loadExpected(): ExpectedPeople {
  const raw = JSON.parse(
    readFileSync('tests/sim/fixtures/lines-migration-expected.json', 'utf8'),
  ) as { people: ExpectedPeople };
  return raw.people;
}

describe('lines.json → line-fragments migration', () => {
  it('covers every person method and mark text verbatim via loadData().lineFragments', () => {
    const expected = loadExpected();
    const alone = (loadData().lineFragments.fragments ?? []).filter((f) => f.slot === 'alone');
    let total = 0;
    let covered = 0;
    const missing: string[] = [];
    for (const [pid, person] of Object.entries(expected)) {
      for (const [mid, text] of Object.entries(person.methods || {})) {
        total++;
        const hit = alone.find(
          (f) =>
            (f.tags || []).includes(`person:${pid}`) &&
            (f.tags || []).includes(`method:${mid}`) &&
            f.text === text,
        );
        if (hit) covered++;
        else missing.push(`method:${pid}.${mid}`);
      }
      for (const [mk, text] of Object.entries(person.marks || {})) {
        total++;
        const hit = alone.find(
          (f) =>
            (f.tags || []).includes(`person:${pid}`) &&
            (f.tags || []).includes(`mark:${mk}`) &&
            f.text === text,
        );
        if (hit) covered++;
        else missing.push(`mark:${pid}.${mk}`);
      }
    }
    expect(missing, `missing ${missing.join(', ')}`).toEqual([]);
    expect(covered).toBe(total);
    expect(total).toBe(120);
    // eslint-disable-next-line no-console
    console.log(`MIGRATION test: ${covered}/${total} covered verbatim`);
  });

  it('pickFixedReactionLine reads alone fragments without data.lines people', () => {
    const data = loadData();
    const state = {
      data: {
        ...data,
        // Fragments-only: no lines.json people table at runtime
        lines: { deprecated: true },
      },
    } as unknown as SimState & { data: ReturnType<typeof loadData> };

    const ctx: ReactionPickCtx = {
      personId: 'marta_ellison',
      methodId: 'challenge',
      seed: 1,
      state: state as ReactionPickCtx['state'],
      features: { bakedDynamismLines: false },
    };
    const result = pickFixedReactionLine(ctx);
    expect(result.source).toBe('fixed');
    expect(result.text).toBe(
      'You want a fight with yeast? Fine. Heat\'s a kind of argument.',
    );
    expect(result.lineId).not.toBe('marta_ellison.challenge');
  });
});
