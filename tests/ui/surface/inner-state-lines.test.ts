import { describe, expect, it } from 'vitest';
import fallbacks from '../../../src/data/dialogue/surface-fallbacks.json';
import { presentJuice } from '../../../src/ui/surface';
import { notorietyLevel, woundChemistry } from '../../../src/ui/surface/reaction-lines';
import { strongestMarkTell } from '../../../src/render/mark-tells';

const L = (fallbacks as { lines: Record<string, string[]> }).lines;

describe('mark.applied -> the person reacts in a line keyed by mark', () => {
  it.each(['dependence', 'hollowness', 'genuine_growth', 'resentment', 'fragile_hope'])('%s', (markId) => {
    const p = presentJuice('mark.applied', { personId: 'a', markId, interactionId: 'i' });
    expect(p).toMatchObject({ kind: 'line', personId: 'a', cue: 'mark' });
    expect(L[`mark.${markId}`]).toContain(p!.line);
  });
  it('unknown mark falls back; no person says nothing', () => {
    expect(L.mark).toContain(presentJuice('mark.applied', { personId: 'a', markId: 'odd' })!.line);
    expect(presentJuice('mark.applied', { markId: 'dependence' })).toBeNull();
  });
});

describe('person.wound -> wound x method chemistry line', () => {
  it('buckets: clearly over 1 is deep, clearly under is slid, near 1 is nothing', () => {
    expect(woundChemistry(1.5)).toBe('deep');
    expect(woundChemistry(1.2)).toBe('deep');
    expect(woundChemistry(1.1)).toBeNull();
    expect(woundChemistry(0.9)).toBeNull();
    expect(woundChemistry(0.7)).toBe('slid');
    expect(woundChemistry(0.2)).toBe('slid');
    expect(woundChemistry(undefined)).toBeNull();
  });
  it('lines are keyed by wound when authored, else generic', () => {
    const deep = presentJuice('person.wound', { personId: 'a', woundId: 'grief', woundMul: 1.4 });
    expect(L['wound_deep.grief']).toContain(deep!.line);
    const slid = presentJuice('person.wound', { personId: 'a', woundId: 'unknown_wound', woundMul: 0.5 });
    expect(L.wound_slid).toContain(slid!.line);
    expect(presentJuice('person.wound', { personId: 'a', woundId: 'grief', woundMul: 1.1 })).toBeNull();
  });
  it('every authored wound has both a deep and a slid line', () => {
    for (const w of ['grief', 'fear', 'apathy', 'exhaustion', 'disillusionment', 'shame_wound']) {
      expect(L[`wound_deep.${w}`]?.length).toBeGreaterThan(0);
      expect(L[`wound_slid.${w}`]?.length).toBeGreaterThan(0);
    }
  });
});

describe('status.gain -> through the crowd', () => {
  it('civic_voice is said by someone else in that town', () => {
    const asked: [string | undefined, string | undefined][] = [];
    const ctx = { nearbyPersonId: (t?: string, ex?: string) => (asked.push([t, ex]), 'crowd') };
    const p = presentJuice('status.gain', { traitId: 'civic_voice', personId: 'stood', townId: 'ashford' }, ctx);
    expect(asked).toEqual([['ashford', 'stood']]);
    expect(p).toMatchObject({ personId: 'crowd', townId: 'ashford' });
    expect(L['status_gain.civic_voice']).toContain(p!.line);
  });
});

describe('notoriety.rise -> nearby people react per level', () => {
  it('levels follow the authored thresholds', () => {
    expect(notorietyLevel(0.05)).toBe('whisper');
    expect(notorietyLevel(0.3)).toBe('talk');
    expect(notorietyLevel(0.5)).toBe('known');
    expect(notorietyLevel(0.8)).toBe('infamous');
    expect(notorietyLevel('x')).toBeNull();
  });
  it('the line matches the level', () => {
    const ctx = { nearbyPersonId: () => 'n' };
    for (const [n, lvl] of [[0.1, 'whisper'], [0.3, 'talk'], [0.5, 'known'], [0.9, 'infamous']] as const) {
      expect(L[`notoriety_rise.${lvl}`]).toContain(presentJuice('notoriety.rise', { notoriety: n }, ctx)!.line);
    }
    expect(L.notoriety_rise).toContain(presentJuice('notoriety.rise', {}, ctx)!.line);
  });
  it('a fall is noticed by someone nearby too', () => {
    const p = presentJuice('notoriety.fall', { notoriety: 0.1 }, { nearbyPersonId: () => 'n' });
    expect(p).toMatchObject({ personId: 'n', tell: 'glance' });
    expect(L.notoriety_fall).toContain(p!.line);
  });
});

describe('mark tells on the body', () => {
  it('strongest mark wins; ties go to the heavier mark; none when unmarked', () => {
    expect(strongestMarkTell(undefined)).toBeNull();
    expect(strongestMarkTell([])).toBeNull();
    expect(strongestMarkTell([{ markId: 'genuine_growth', stacks: 2 }, { markId: 'dependence', stacks: 1 }])?.markId).toBe('genuine_growth');
    expect(strongestMarkTell([{ markId: 'genuine_growth', stacks: 1 }, { markId: 'dependence', stacks: 1 }])?.markId).toBe('dependence');
    expect(strongestMarkTell([{ markId: 'nope', stacks: 3 }])).toBeNull();
  });
  it('every mark in marks.json has a distinct glyph', async () => {
    const marks = (await import('../../../src/data/systems/marks.json')).default.marks.map((m: { id: string }) => m.id);
    const glyphs = marks.map((id: string) => strongestMarkTell([{ markId: id, stacks: 1 }])?.glyph);
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(marks.length);
  });
});
