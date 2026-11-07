import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import doctrines from '../../../src/data/systems/doctrines.json';

describe('authored doctrine voices exist at boot', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: every doctrine leaderPersonId is present in its town with a voice tag`, () => {
      const { state } = bootPlayState(seed, 'marrow');
      for (const d of doctrines.doctrines as { id: string; townId: string; leaderPersonId: string | null }[]) {
        if (!d.leaderPersonId) continue;
        const p = state.people[d.leaderPersonId];
        expect(p, `${d.id} leader ${d.leaderPersonId}`).toBeDefined();
        expect(p!.townId).toBe(d.townId);
        expect(p!.tags?.some((t) => t === 'leader' || t === 'doctrine_voice')).toBe(true);
      }
    });
  }
});
