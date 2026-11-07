import { describe, expect, it } from 'vitest';
import { bootPlayState } from '../../../src/sim/play-session/play-session-state';
import doctrines from '../../../src/data/systems/doctrines.json';

describe('authored doctrine voices exist at boot', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`seed ${seed}: every doctrine leaderPersonId is present (in its town when that town exists) with a voice tag`, () => {
      const { state, world } = bootPlayState(seed, 'marrow');
      const present = new Set((world.settlements ?? []).map((t) => t.id));
      for (const d of doctrines.doctrines as { id: string; townId: string; leaderPersonId: string | null }[]) {
        if (!d.leaderPersonId) continue;
        const p = state.people[d.leaderPersonId];
        expect(p, `${d.id} leader ${d.leaderPersonId}`).toBeDefined();
        // The generated 2D world holds a subset of the authored towns. A leader whose
        // authored town is absent lives in a settlement that does exist (never a phantom town).
        if (present.has(d.townId)) expect(p!.townId).toBe(d.townId);
        else expect(present.has(p!.townId!), `${d.id} leader town ${p!.townId}`).toBe(true);
        expect(p!.tags?.some((t) => t === 'leader' || t === 'doctrine_voice')).toBe(true);
      }
    });
  }
});
