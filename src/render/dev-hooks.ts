import type { PlaySession } from '../sim/play-session/play-session-types';

/**
 * QA / e2e hooks on `window.__hearth.dev`. A system adds its hooks by calling `registerDevHook` from a
 * module imported in `src/render/dev/index.ts` (one import per system), instead of editing the dev
 * block in overworld-scene.ts. Built-in hooks keep their names; a registered name may not shadow one.
 */
export interface DevHookContext {
  session: PlaySession;
  /** The running overworld scene (typed loosely to avoid an import cycle; cast where needed). */
  scene: unknown;
}

type DevHookFactory = (ctx: DevHookContext) => unknown;
const factories = new Map<string, DevHookFactory>();

export function registerDevHook(name: string, factory: DevHookFactory): void {
  factories.set(name, factory);
}

/** Build every registered hook for this scene; names already in `builtIn` are skipped with a warning. */
export function collectDevHooks(ctx: DevHookContext, builtIn: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, make] of factories) {
    if (name in builtIn) { console.warn(`dev hook "${name}" shadows a built-in hook; skipped`); continue; }
    out[name] = make(ctx);
  }
  return out;
}
