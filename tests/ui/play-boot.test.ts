import { describe, expect, it } from 'vitest';
import { createPlaySession } from '../../src/sim';
import { townsFromDump } from '../../src/sim/towns-from-dump';

describe('play boot overworld towns', () => {
  it('boot exposes overworld town markers from session', async () => {
    const session = createPlaySession({
      mode: 'inspect',
      seed: 42,
      peopleCount: 8,
    });
    expect(session).not.toBeNull();
    const towns = townsFromDump(session!.dump());
    expect(towns.length).toBeGreaterThanOrEqual(3);
  });
});
