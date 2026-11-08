/**
 * Piles of heavy goods (sim/carry): a facility's yard beside its building, and each town's stock of logs,
 * stones, sacks, ore, firewood, wool bales and cloth bolts in rows below the hearth. The heap grows with what is there; an empty
 * spot is a faint patch of trodden ground (a town's spot still takes a load). Things: `prop:pile:<pileKey>`
 * (kind prop, data.type 'pile'), one verb each so E lifts or sets down at once. Also paints the load art
 * (`carry-<shape>`) the player's carried sprite uses (actors/carry-draw), since world attaches first.
 */
import type Phaser from 'phaser';
import type { Thing } from '../../app/contracts';
import { registerDevHook } from '../../app/dev-hooks';
import { CARRY, facilityPileKey, listPiles, loadRow, pileTarget, pileView, townPileKey, type PileView } from '../../sim/carry';
import { facilityPlaces } from '../../sim/economy/facilities';
import { TILE_PX } from '../../sim/map/constants';
import type { SimState } from '../../sim/types/runtime';
import { ART_SCALE, makeTex, type Px } from '../art/px';
import { DECAL_DEPTH, tileFoot, type Pt } from '../depth';
import type { TownSpots } from '../town-spots';

const REACH = 36;
/** Re-read the piles' contents this often (ms): cheap, and acts elsewhere (dawn, wagons) change them. */
const RESYNC_MS = 400;
const MAX_STACK = 5;

const SHAPES: Record<string, [number, number, (p: Px) => void]> = {
  logs: [14, 8, (p) => {
    for (const [x, y] of [[0, 4], [5, 4], [2, 0]] as const) p.rect(x, y, 9, 4, '#8a5a2b').rect(x, y, 9, 1, '#b8844e').rect(x + 8, y + 1, 1, 2, '#e0bf8a');
  }],
  stones: [12, 7, (p) => { p.disc(3, 4.5, 3, 2.4, '#8e8e86').disc(8.5, 4.5, 3, 2.4, '#a3a39a').disc(6, 2.2, 2.6, 2, '#b8b8ae'); }],
  sack: [10, 9, (p) => { p.disc(5, 5.5, 4.4, 3.4, '#c8a46a').rect(3, 1, 4, 2, '#b08a54').px(5, 0, '#7a5a34').rect(2, 5, 6, 1, '#a88a58'); }],
  ore: [10, 6, (p) => { p.disc(3, 3.5, 2.8, 2.2, '#5e4a40').disc(7, 3.5, 2.8, 2.2, '#6e5a4e').px(3, 2, '#c87a4a').px(7, 3, '#b8a080'); }],
  // Wool bales and cloth bolts (carry.json shapes): their own look, not two identical crates side by side.
  bale: [11, 8, (p) => { p.disc(5.5, 4.5, 5, 3.4, '#e6dcc4').disc(4, 3.5, 2.4, 1.8, '#f6f0e2').rect(1, 4, 9, 1, '#a88a58').px(8, 5, '#cfc2a4'); }],
  bolts: [12, 7, (p) => {
    for (const [y, c, l] of [[3, '#5a6e9a', '#7a90bc'], [0, '#9a4a4a', '#bc6a6a']] as const) p.rect(1, y, 10, 4, c).rect(1, y, 10, 1, l).disc(1, y + 2, 1, 2, '#e6dcc4').px(1, y + 2, c);
  }],
  crate: [10, 8, (p) => { p.rect(0, 0, 10, 8, '#9a6a3a').rect(0, 0, 10, 1, '#c8945a').rect(1, 3, 8, 1, '#6a4a2a').rect(4, 1, 1, 6, '#6a4a2a'); }],
};
const texOf = (shape: string): string => `carry-${SHAPES[shape] ? shape : 'crate'}`;

type View = { key: string; pos: Pt; objs: Phaser.GameObjects.GameObject[]; sig: string; p: PileView | null };

export type PilesLayer = {
  things(near: Pt, radius: number): Thing[];
  refresh(): void;
  setVisible(on: boolean): void;
  destroy(): void;
};

export function createPiles(scene: Phaser.Scene, getState: () => SimState | undefined, towns: TownSpots[]): PilesLayer {
  for (const [shape, [w, h, draw]] of Object.entries(SHAPES)) makeTex(scene, texOf(shape), w, h, draw);
  const views = new Map<string, View>();
  let visible = true;
  let spotsSig = '';
  let last = -Infinity;

  /** Where each pile stands: fixed by the facility's tile or the town's hearth, so nothing is saved. */
  const spots = (s: SimState): { key: string; pos: Pt }[] => {
    const out: { key: string; pos: Pt }[] = [];
    for (const f of facilityPlaces(s)) {
      const foot = tileFoot(f.q, f.r);
      (CARRY.facilityPiles[f.kind] ?? []).forEach((item, i) => out.push({ key: facilityPileKey(f.id, item), pos: { x: foot.x - 44 - i * 26, y: foot.y + 6 } }));
    }
    for (const t of towns) {
      if (!s.towns?.[t.town.id]) continue;
      // Rows of four below the hearth: one long row ran under the noticeboard and the signpost beside it.
      const COLS = 4, n = CARRY.townPiles.length;
      CARRY.townPiles.forEach((item, i) => {
        const row = Math.floor(i / COLS), inRow = Math.min(COLS, n - row * COLS);
        out.push({ key: townPileKey(t.town.id, item), pos: { x: t.hearth.x + ((i % COLS) - (inRow - 1) / 2) * 26, y: t.hearth.y + TILE_PX * 2 + row * 22 } });
      });
    }
    return out;
  };

  const draw = (v: View): void => {
    v.objs.forEach((o) => o.destroy());
    v.objs = [];
    const p = v.p;
    const ground = scene.add.graphics().setDepth(DECAL_DEPTH);
    ground.fillStyle(0x6a5a40, p && p.have > 0 ? 0.3 : 0.18).fillEllipse(v.pos.x, v.pos.y - 3, 26, 9);
    v.objs.push(ground);
    if (p && p.have > 0) {
      const tex = texOf(loadRow(p.itemId)?.shape ?? 'crate');
      const n = Math.min(MAX_STACK, Math.ceil(p.have / 2));
      for (let i = 0; i < n; i++) {
        // A small pyramid: two along the bottom, then up.
        const row = i < 2 ? 0 : i < 4 ? 1 : 2, col = i < 2 ? i : i < 4 ? i - 2 : 0;
        const x = v.pos.x + (col - (row === 2 ? 0 : 0.5)) * 10, y = v.pos.y - row * 7;
        v.objs.push(scene.add.image(x, y, tex).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(v.pos.y + i * 0.01));
      }
    }
    for (const o of v.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
  };

  const refresh = (): void => {
    last = performance.now();
    const s = getState();
    if (!s) return;
    const all = spots(s);
    const sig = all.map((a) => a.key).join('|');
    if (sig !== spotsSig) {
      spotsSig = sig;
      for (const v of views.values()) v.objs.forEach((o) => o.destroy());
      views.clear();
      for (const a of all) views.set(a.key, { key: a.key, pos: a.pos, objs: [], sig: '#', p: null });
    }
    for (const v of views.values()) {
      v.p = pileView(s, v.key);
      const next = `${v.p?.itemId ?? ''}:${Math.min(MAX_STACK, Math.ceil((v.p?.have ?? 0) / 2))}:${(v.p?.have ?? 0) > 0}`;
      if (next === v.sig) continue;
      v.sig = next;
      draw(v);
    }
  };

  return {
    things(near, radius) {
      if (performance.now() - last > RESYNC_MS) refresh();
      const s = getState();
      const holding = !!s?.player.carrying;
      const out: Thing[] = [];
      for (const v of views.values()) {
        const p = v.p;
        if (!p || Math.hypot(v.pos.x - near.x, v.pos.y - near.y) > radius) continue;
        // An empty pile is only a place to set a load down.
        if (p.have <= 0 && !holding) continue;
        const label = p.source === 'town' ? `Town ${p.name}${p.have > 0 ? ` · ${p.have}` : ''}` : `${p.name.replace(/^\w/, (c) => c.toUpperCase())} · ${p.have}`;
        out.push({ key: `prop:pile:${p.key}`, kind: 'prop', id: `pile:${p.key}`, x: v.pos.x, y: v.pos.y, reach: REACH, label, target: pileTarget(p.key) });
      }
      return out;
    },
    refresh,
    setVisible(on) { visible = on; for (const v of views.values()) for (const o of v.objs) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(on); },
    destroy() { for (const v of views.values()) v.objs.forEach((o) => o.destroy()); views.clear(); },
  };
}

/** Every pile in the district with its thing key and (for drawn ones) where it stands near you. */
registerDevHook('piles', (ctx) => () => {
  const st = ctx.session.getState();
  if (!st) return [];
  const drawn = new Map(ctx.world.things(ctx.actors.player.pos(), 1e6).filter((t) => t.key.startsWith('prop:pile:')).map((t) => [t.key, { x: t.x, y: t.y }]));
  return listPiles(st).map((p) => ({ ...p, thingKey: p.source === 'wagon' ? p.key : `prop:pile:${p.key}`, at: drawn.get(`prop:pile:${p.key}`) ?? null }));
});
