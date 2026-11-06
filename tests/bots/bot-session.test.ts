import { describe, expect, it } from 'vitest';
import { connectBotSession, type BotSession } from './bot-session';

describe('connectBotSession', () => {
  it('returns null when Forge play-session API is not exported yet', async () => {
    const session = await connectBotSession();
    expect(session).toBeNull();
  });

  it('BotSession contract is structurally usable via a fake', () => {
    const fake: BotSession = {
      start({ seed, archetypeId }) {
        void seed;
        void archetypeId;
      },
      listActions: () => [{ id: 'comfort', family: 'kind' }],
      act() {},
      tick() {},
      snapshot: () => ({
        tick: 0,
        spark: 1,
        burnedOut: false,
        reignitedCount: 0,
        hollowCount: 0,
        fingerprint: 'fp-0',
      }),
      events: () => [],
    };
    fake.start({ seed: 1, archetypeId: 'marrow' });
    expect(fake.listActions()).toHaveLength(1);
    fake.act('comfort');
    fake.tick();
    expect(fake.snapshot().fingerprint).toBe('fp-0');
  });
});
