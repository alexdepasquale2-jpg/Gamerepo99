/**
 * M3 special bar on generated worlds (Task 7).
 * BAR: ≥3 of 5 memorable moments green; anchors preferred when present.
 */
import { describe, expect, it } from 'vitest';
import {
  createPlaySession,
  resolveScenarioPerson,
  type PlaySession,
} from '../../../src/sim';

const MEMORABLE = [
  'moment_warm_loaf_cold_hill',
  'moment_refusal_coal',
  'moment_mark_comes_back',
  'moment_chalk_after_the_cut',
  'moment_nail_across_the_water',
] as const;

function asPlay(s: ReturnType<typeof createPlaySession>): PlaySession {
  if (!s || !('start' in s)) throw new Error('expected play session');
  return s as PlaySession;
}

describe('special-bar on generated world', () => {
  it('warm-loaf path finds bakery-capable person on seed with anchors', () => {
    const s = asPlay(createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' }));
    s.start();
    const personId = resolveScenarioPerson(s, {
      preferAnchorId: 'marta_ellison',
      siteKind: 'bakery',
      woundId: 'apathy',
    });
    expect(personId).toBeTruthy();
    expect(personId).toBe('marta_ellison');
    s.act(`carry_burden@${personId}`);
    s.act('advance:dusk');
    expect(s.events().some((e) => e.type === 'site.kindle' || e.type === 'spark.spend')).toBe(
      true,
    );
  });

  it('refusal coal finds child-tagged person and refuses shame', () => {
    const s = asPlay(createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }));
    s.start();
    const personId = resolveScenarioPerson(s, {
      preferAnchorId: 'jonah_pike',
      tagsAny: ['child'],
      woundId: 'fear',
    });
    expect(personId).toBeTruthy();
    s.act(`shame@${personId}`);
    expect(s.events().some((e) => e.type === 'refusal.coal_flicker')).toBe(true);
    expect(s.listActions().some((a) => a.id === `shame@${personId}`)).toBe(true);
  });

  it('mark comes back lands a mark and second resolve differs', () => {
    const s = asPlay(createPlaySession({ mode: 'play', seed: 99, archetypeId: 'marrow' }));
    s.start();
    const personId = resolveScenarioPerson(s, {
      preferAnchorId: 'harold_finch',
      woundId: 'exhaustion',
    });
    expect(personId).toBeTruthy();
    s.act(`challenge@${personId}`);
    const first = s.lastResolve?.();
    expect(first).toBeTruthy();
    s.act(`carry_burden@${personId}`);
    const second = s.lastResolve?.();
    expect(second).toBeTruthy();
    const differs =
      first!.flameDelta !== second!.flameDelta || first!.sparkCost !== second!.sparkCost;
    expect(differs || (second!.marks?.length ?? 0) > 0).toBe(true);
    const person = s.listPeople().find((p) => p.id === personId);
    expect((person?.marks?.length ?? 0) > 0).toBe(true);
  });

  it('resolver prefers anchor when present, else tag/wound match', () => {
    const s = asPlay(createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' }));
    s.start();
    const anchored = resolveScenarioPerson(s, {
      preferAnchorId: 'marta_ellison',
      woundId: 'apathy',
      siteKind: 'bakery',
    });
    expect(anchored).toBe('marta_ellison');
    const byWound = resolveScenarioPerson(s, { woundId: 'apathy' });
    expect(byWound).toBeTruthy();
    const byTag = resolveScenarioPerson(s, { tagsAny: ['child'] });
    expect(byTag).toBeTruthy();
  });

  it('first-10-min metrics flags record on approach and method', () => {
    const s = asPlay(createPlaySession({ mode: 'play', seed: 11, archetypeId: 'marrow' }));
    s.start();
    const personId = resolveScenarioPerson(s, { preferAnchorId: 'marta_ellison' });
    expect(personId).toBeTruthy();
    s.act(`approach@${personId}`);
    expect(s.metrics().firstChoiceAtTick).toBeTypeOf('number');
    s.act(`inspire@${personId}`);
    expect(s.metrics().firstConsequenceAtTick).toBeTypeOf('number');
    expect(s.metrics().firstConsequenceAtTick!).toBeGreaterThanOrEqual(
      s.metrics().firstChoiceAtTick!,
    );
  });

  it('at least 3 of 5 memorable moments green on gen seeds', () => {
    const results: Record<string, boolean> = {};

    {
      const s = asPlay(createPlaySession({ mode: 'play', seed: 7, archetypeId: 'marrow' }));
      s.start();
      const id = resolveScenarioPerson(s, {
        preferAnchorId: 'marta_ellison',
        siteKind: 'bakery',
        woundId: 'apathy',
      });
      if (id) {
        s.act(`carry_burden@${id}`);
        s.act('advance:dusk');
        results.moment_warm_loaf_cold_hill = s
          .events()
          .some((e) => e.type === 'site.kindle' || e.type === 'spark.spend');
      } else results.moment_warm_loaf_cold_hill = false;
    }

    {
      const s = asPlay(createPlaySession({ mode: 'play', seed: 42, archetypeId: 'marrow' }));
      s.start();
      const id = resolveScenarioPerson(s, {
        preferAnchorId: 'jonah_pike',
        tagsAny: ['child'],
      });
      if (id) {
        s.act(`shame@${id}`);
        results.moment_refusal_coal = s.events().some((e) => e.type === 'refusal.coal_flicker');
      } else results.moment_refusal_coal = false;
    }

    {
      const s = asPlay(createPlaySession({ mode: 'play', seed: 99, archetypeId: 'marrow' }));
      s.start();
      const id = resolveScenarioPerson(s, {
        preferAnchorId: 'harold_finch',
        woundId: 'exhaustion',
      });
      if (id) {
        s.act(`challenge@${id}`);
        s.act(`carry_burden@${id}`);
        const p = s.listPeople().find((x) => x.id === id);
        results.moment_mark_comes_back = (p?.marks?.length ?? 0) > 0;
      } else results.moment_mark_comes_back = false;
    }

    {
      const s = asPlay(createPlaySession({ mode: 'play', seed: 13, archetypeId: 'ivy_quill' }));
      s.start();
      const id = resolveScenarioPerson(s, {
        preferAnchorId: 'ruth_calder',
        woundId: 'disillusionment',
      });
      if (id) {
        s.act(`shame@${id}`);
        s.act('advance:dawn');
        s.act('advance:dawn');
        const p = s.listPeople().find((x) => x.id === id);
        results.moment_chalk_after_the_cut = (p?.marks ?? []).some((m) => m.markId === 'hollowness');
      } else results.moment_chalk_after_the_cut = false;
    }

    {
      const s = asPlay(createPlaySession({ mode: 'play', seed: 21, archetypeId: 'marrow' }));
      s.start();
      const id = resolveScenarioPerson(s, {
        preferAnchorId: 'elias_boone',
        woundId: 'grief',
      });
      if (id) {
        s.act(`challenge@${id}`);
        s.act('advance:dawn');
        results.moment_nail_across_the_water = s
          .events()
          .some((e) => e.type === 'packet.emit' || e.type === 'site.kindle' || e.type === 'mark.applied');
      } else results.moment_nail_across_the_water = false;
    }

    const green = MEMORABLE.filter((id) => results[id]).length;
    expect(green, `moments=${JSON.stringify(results)}`).toBeGreaterThanOrEqual(3);
  });
});
