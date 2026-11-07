import { describe, expect, it } from 'vitest';
import { BOT_PLAY_SESSION_OPTS, connectBotSession, type BotSession } from './bot-session';

describe('connectBotSession', () => {
  it('feature-detects createPlaySession play shell from src/sim', async () => {
    const session = await connectBotSession();
    expect(session).not.toBeNull();
    session!.start({ seed: 42, archetypeId: 'marrow' });
    expect(session!.snapshot().spark).toBeGreaterThan(0);
    expect(session!.listActions().length).toBeGreaterThan(0);
  });

  it('passes play-mode factory opts with interactionCompat: true', () => {
    expect(BOT_PLAY_SESSION_OPTS).toMatchObject({ mode: 'play', interactionCompat: true });
  });

  it('live session routes inspire@<person> through the interaction model', async () => {
    const session = await connectBotSession();
    expect(session).not.toBeNull();
    session!.start({ seed: 42, archetypeId: 'marrow' });
    const inspire = session!.listActions().find((a) => a.id.startsWith('inspire@'));
    expect(inspire).toBeDefined();
    const sparkBefore = session!.snapshot().spark;

    session!.act(inspire!.id);

    const events = session!.events();
    expect(events).toContainEqual({ type: 'interaction', methodId: 'talk_gentle' });
    expect(events.some((e) => e.type === 'spark.spend')).toBe(false);
    expect(session!.snapshot().spark).toBe(sparkBefore - 1); // talk_gentle: strain 1, gain 1, gentle tag -1
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
