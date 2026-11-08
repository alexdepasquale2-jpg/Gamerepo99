/**
 * The player's resting pose, passed between areas without either importing the other: world/linger.ts says
 * "sit" when you have stood still by a tree or a fire, actors/player.ts lowers the figure. One per run (ctx).
 */
import type { GameContext, PlayerPose } from './contracts';

type Channel = { pose: PlayerPose; subs: Set<(p: PlayerPose) => void> };
const channels = new WeakMap<GameContext, Channel>();
const channel = (ctx: GameContext): Channel => {
  let c = channels.get(ctx);
  if (!c) channels.set(ctx, (c = { pose: null, subs: new Set() }));
  return c;
};

export const playerPose = (ctx: GameContext): PlayerPose => channel(ctx).pose;

export function setPlayerPose(ctx: GameContext, pose: PlayerPose): void {
  const c = channel(ctx);
  if (c.pose === pose) return;
  c.pose = pose;
  for (const fn of [...c.subs]) fn(pose);
}

export function onPlayerPose(ctx: GameContext, fn: (p: PlayerPose) => void): () => void {
  const c = channel(ctx);
  c.subs.add(fn);
  return () => void c.subs.delete(fn);
}
