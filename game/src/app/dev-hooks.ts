import type { GameContext } from './contracts';

/**
 * QA hooks on `window.__hearth`. Areas register theirs with registerDevHook(name, ctx => value) at import
 * time; the shell builds them once per run. `__hearth.ctx` and `__hearth.session` are always there.
 */
type Factory = (ctx: GameContext) => unknown;
const factories = new Map<string, Factory>();

export function registerDevHook(name: string, factory: Factory): void {
  factories.set(name, factory);
}

export function installDevHooks(ctx: GameContext): void {
  const dev: Record<string, unknown> = {};
  for (const [name, make] of factories) {
    try { dev[name] = make(ctx); } catch (err) { console.error(`dev hook ${name} failed`, err); }
  }
  (window as unknown as { __hearth?: unknown }).__hearth = { ctx, session: ctx.session, scene: ctx.scene, dev };
}
