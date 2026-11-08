/**
 * Stash chests (sim/hoard): one per stash site, in its town. The tally is drawn, not written: a stack of
 * coins beside it (one coin per 5), sacks for stored goods (one per 3), and a guard's spear and shield
 * per hired guard. The lid stands open while it holds anything. Things: `chest:<siteId>`.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';
import { ensureHoard } from '../../sim/hoard';
import { siteDefs, totalGoods } from '../../sim/hoard/state';
import { ART_SCALE } from '../art/px';
import { thingTex } from '../art/thing-art';
import type { Pt } from '../depth';

const REACH = 44;
const MAX_COINS = 8, MAX_SACKS = 4, MAX_GUARDS = 2;
type View = { siteId: string; name: string; pos: Pt; chest: Phaser.GameObjects.Image; tally: Phaser.GameObjects.Image[]; sig: string };

export type ChestTally = { coin: number; goods: number; guards: number };
export type ChestsLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  tally(siteId: string): ChestTally | null;
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createChests(scene: Phaser.Scene, getState: () => SimState | undefined, chestAt: (townId: string) => Pt | undefined): ChestsLayer {
  let views: View[] = [];
  let visible = true;
  let sitesSig = '';

  const tallyOf = (siteId: string): ChestTally => {
    const st = getState();
    const s = st ? ensureHoard(st).stash[siteId] : undefined;
    return { coin: s?.coin ?? 0, goods: s ? totalGoods(s) : 0, guards: s?.guardsHired ?? 0 };
  };

  const build = (): void => {
    for (const v of views) { v.chest.destroy(); v.tally.forEach((t) => t.destroy()); }
    const st = getState();
    views = (st ? siteDefs(st) : []).flatMap((d) => {
      const pos = chestAt(d.townId);
      if (!pos) return [];
      const chest = scene.add.image(pos.x, pos.y, thingTex('chest')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(pos.y).setVisible(visible);
      return [{ siteId: d.id, name: d.name ?? 'Hiding place', pos, chest, tally: [], sig: '' }];
    });
  };

  const draw = (v: View, t: ChestTally): void => {
    v.tally.forEach((o) => o.destroy());
    v.tally = [];
    const add = (x: number, y: number, key: string, depth: number) =>
      v.tally.push(scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(depth).setVisible(visible));
    const coins = Math.min(MAX_COINS, Math.ceil(t.coin / 5));
    for (let i = 0; i < coins; i++) add(v.pos.x + 20 + (i >= 4 ? 10 : 0), v.pos.y - (i % 4) * 4, thingTex('coin'), v.pos.y + 0.1 + i * 0.01);
    const sacks = Math.min(MAX_SACKS, Math.ceil(t.goods / 3));
    for (let i = 0; i < sacks; i++) add(v.pos.x - 20 - (i % 2) * 12, v.pos.y - Math.floor(i / 2) * 8, thingTex('sack'), v.pos.y + 0.1 + i * 0.01);
    for (let i = 0; i < Math.min(MAX_GUARDS, t.guards); i++) add(v.pos.x - 6 + i * 14, v.pos.y - 14, thingTex('guard'), v.pos.y - 14);
    v.chest.setTexture(thingTex(t.coin + t.goods > 0 ? 'chest-open' : 'chest'));
  };

  const refresh = (): void => {
    const st = getState();
    const sig = st ? siteDefs(st).map((d) => d.id).join('|') : '';
    if (sig !== sitesSig) { sitesSig = sig; build(); }
    for (const v of views) {
      const t = tallyOf(v.siteId);
      const next = `${t.coin}:${t.goods}:${t.guards}`;
      if (next === v.sig) continue;
      const grew = v.sig !== '' && t.coin + t.goods > Number(v.sig.split(':')[0]) + Number(v.sig.split(':')[1]);
      v.sig = next;
      draw(v, t);
      if (grew) scene.tweens.add({ targets: v.chest, scaleY: ART_SCALE * 1.15, duration: 90, yoyo: true });
    }
  };

  return {
    things(near, radius) {
      return views.filter((v) => Math.hypot(v.pos.x - near.x, v.pos.y - near.y) <= radius).map((v) => ({
        key: `chest:${v.siteId}`, kind: 'chest' as const, id: v.siteId, x: v.pos.x, y: v.pos.y, reach: REACH,
        label: v.name, target: { kind: 'chest' as const, id: v.siteId },
      }));
    },
    refresh,
    tally: (siteId) => (views.some((v) => v.siteId === siteId) ? tallyOf(siteId) : null),
    setVisible(on) { visible = on; for (const v of views) { v.chest.setVisible(on); v.tally.forEach((t) => t.setVisible(on)); } },
    destroy() { for (const v of views) { v.chest.destroy(); v.tally.forEach((t) => t.destroy()); } views = []; },
  };
}
