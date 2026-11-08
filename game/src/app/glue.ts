/**
 * Cross-area wiring that belongs to no single area (lead-owned). Keep it small: each block joins two
 * areas' public APIs through events.
 */
import type { GameContext } from './contracts';
import { dropItem } from '../sim/goods/item-use';

export function attachGlue(ctx: GameContext): () => void {
  const offs = [
    // A hotbar drag let go: over a person it is the gift (interact); elsewhere the item is set down.
    ctx.events.on('item-drag', (e) => {
      if (e.phase !== 'drop') return;
      if (ctx.interact.dropItem(e.itemId, e.screen)) return;
      const st = ctx.session.getState();
      if (!st || e.itemId === 'coin') return;
      if (dropItem(st, e.itemId, e.world)) {
        ctx.world.refresh('ground');
        ctx.events.emit('inventory', {});
        ctx.voice.sfx('pickup');
      }
    }),
  ];
  return () => offs.forEach((off) => off());
}
