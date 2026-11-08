/** ACTORS area (stub). Owner: the actors agent. Replace everything in src/actors/ — keep attachActors. See game/README.md. */
import type { ActorsApi, GameContext, Pt } from '../app/contracts';

export function attachActors(ctx: GameContext): ActorsApi {
  let pos: Pt = { x: 0, y: 0 };
  const dot = ctx.scene.add.circle(0, 0, 6, 0xf2b84b).setDepth(10);
  ctx.scene.cameras.main.startFollow(dot, true, 0.15, 0.15);
  return {
    player: {
      pos: () => pos,
      setPos: (p) => { pos = { ...p }; dot.setPosition(p.x, p.y); },
      facing: () => ({ dx: 0, dy: 1 }),
      walkTo: async () => false,
      stop: () => {},
      setFrozen: () => {},
    },
    headOf: () => undefined,
    things: () => [],
    sync: () => {},
    update: () => {},
  };
}
