/**
 * The load in the player's arms, drawn over their head (sim/carry), and the walk factor it costs; also the
 * B-button drop for the pad. Kept out of player.ts so that file only gains a few lines: create, update,
 * speed, destroy.
 */
import type Phaser from 'phaser';
import type { CarryApi, GameContext, Pt } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
import { carrySpeed, loadRow } from '../sim/carry';
import type { SimState } from '../sim/types/runtime';

/**
 * Load art is painted by the world's pile layer (world/things/piles, attached before actors) under
 * `carry-<shape>`; areas share it by key, not by import.
 */
const texOf = (scene: Phaser.Scene, shape: string): string | null =>
  scene.textures.exists(`carry-${shape}`) ? `carry-${shape}` : scene.textures.exists('carry-crate') ? 'carry-crate' : null;
export const shapeOf = (itemId: string): string => loadRow(itemId)?.shape ?? 'crate';

export type CarryDraw = { update(visible: boolean): void; speed(): number; destroy(): void };

/** The carried load sits just above the head, following the body. */
export function createCarryDraw(scene: Phaser.Scene, head: () => Pt, foot: () => Pt, getState: () => SimState | undefined): CarryDraw {
  let img: Phaser.GameObjects.Image | null = null;
  let shown = '';
  return {
    update(visible) {
      const c = getState()?.player.carrying;
      const want = c ? shapeOf(c.itemId) : '';
      if (want !== shown) {
        img?.destroy();
        const key = want ? texOf(scene, want) : null;
        img = key ? scene.add.image(0, 0, key).setOrigin(0.5, 1).setScale(2) : null;
        shown = want;
      }
      if (!img) return;
      const h = head();
      // Sorted with the body (just in front of it), not with the head's height.
      img.setPosition(h.x, h.y + 4).setDepth(foot().y + 0.5).setVisible(visible);
    },
    speed: () => carrySpeed(getState()),
    destroy() { img?.destroy(); img = null; },
  };
}

/** The carry verbs the pad and dev tools reach without a ring: what is held, and dropping it at your feet. */
export function carryApi(ctx: GameContext): CarryApi {
  return {
    carrying: () => ctx.session.carrying(),
    drop() {
      if (!ctx.session.carrying()) return undefined;
      const out = ctx.session.dropCarried(ctx.actors.player.pos());
      if (out.line) ctx.voice.tell(out.line, 'player');
      ctx.voice.sfx(out.ok ? 'act' : 'refuse');
      if (out.ok) { ctx.world.refresh('ground'); ctx.events.emit('inventory', {}); }
      return out;
    },
  };
}

registerDevHook('carry', (ctx) => () => ({ carrying: ctx.session.carrying(), speed: carrySpeed(ctx.session.getState()), drop: () => carryApi(ctx).drop() }));
