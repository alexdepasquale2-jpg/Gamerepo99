export type BotAction = { id: string; family?: string };

export type BotSnapshot = {
  tick: number;
  spark: number;
  burnedOut: boolean;
  reignitedCount: number;
  hollowCount: number;
  fingerprint: string;
};

export type BotEvent = { type: string; methodId?: string };

export type BotSession = {
  start(opts: { seed: number; archetypeId: string }): void;
  listActions(): BotAction[];
  act(actionId: string): void;
  tick(): void;
  snapshot(): BotSnapshot;
  events(): BotEvent[];
};

/** Known future Forge M2 export names to feature-detect. */
const CANDIDATE_EXPORTS = [
  'createPlaySession',
  'createBotSession',
  'createPlayableSession',
  'createMethodSession',
] as const;

type PlayFactory = (opts?: unknown) => BotSession | Promise<BotSession>;

function wrapIfSession(value: unknown): BotSession | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<BotSession>;
  const required: (keyof BotSession)[] = [
    'start',
    'listActions',
    'act',
    'tick',
    'snapshot',
    'events',
  ];
  for (const key of required) {
    if (typeof s[key] !== 'function') return null;
  }
  return s as BotSession;
}

/**
 * Feature-detect a Forge public play API from `src/sim`.
 * Returns null until M2 exports a matching session factory.
 */
export async function connectBotSession(): Promise<BotSession | null> {
  try {
    const mod = (await import('../../src/sim/index.ts')) as Record<string, unknown>;
    for (const name of CANDIDATE_EXPORTS) {
      const candidate = mod[name];
      if (typeof candidate !== 'function') continue;
      const maybe = await (candidate as PlayFactory)();
      const session = wrapIfSession(maybe);
      if (session) return session;
    }
    // Also accept a pre-built session export
    for (const name of ['playSession', 'botSession'] as const) {
      const session = wrapIfSession(mod[name]);
      if (session) return session;
    }
  } catch {
    // Dynamic import failure → treat as unavailable
  }
  return null;
}
