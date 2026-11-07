/** Wires inventory, resource nodes, schedules, living world and maps into the overworld scene. */

import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { FabricWorld } from '../../sim/gen/world-types';
import type { WorldLayout } from '../../sim/map/world-layout';
import { applyDeedGoods, isGoodsDeed } from '../../sim/goods/deed-goods';
import schedJson from '../../data/world/npc-schedules.json';
import { tileFootWorld } from '../depth-sort';
import { HEARTH_OFFSET, type WorldLife } from '../world-life';
import type { PeopleLayer } from '../people-layer';
import { hash } from '../people-layer';
import { createNodesLayer } from './nodes-layer';
import { createInventoryUi } from './inventory-ui';
import { createWorldMap } from './world-map';
import { createLivingWorld } from './living-world';

type Pt = { x: number; y: number };
const SCHED = schedJson as { phases: { until: number; place: 'home' | 'work' | 'gather' }[] };

export type OverworldGoods = {
  update: (time: number, dt: number, player: Pt) => void;
  onDawn: () => void;
  /** Try gathering a nearby node. Returns a line when something happened. */
  gatherNear: (player: Pt) => string | null;
  /** Item side of a deed before it resolves; ok=false blocks the deed. */
  beforeDeed: (methodId: string, personId: string) => { ok: boolean; line?: string };
  toggleInventory: () => void;
  toggleMap: () => void;
  selectSlot: (i: number) => void;
  overlayOpen: () => boolean;
};

export function attachOverworldGoods(
  scene: Phaser.Scene, session: PlaySession, world: FabricWorld, layout: WorldLayout,
  people: PeopleLayer, life: WorldLife, getPlayer: () => Pt,
): OverworldGoods {
  const seed = session.getSeed();
  const st = () => session.getState();
  const nodes = createNodesLayer(scene, st, seed, layout.settlements, layout.routes);
  const despair = () => session.townDespair();
  const living = createLivingWorld(scene, seed, layout.settlements, layout.routes, st, despair);
  const inv = createInventoryUi(scene, st);
  const meta = new Map((world.settlements ?? []).map((s) => [s.id, s]));
  const map = createWorldMap(
    scene,
    layout.settlements.map((t) => ({ ...t, name: meta.get(t.id)?.name ?? t.id, size: meta.get(t.id)?.politySize ?? 60 })),
    layout.routes,
    { player: getPlayer, caravans: () => living.caravanPositions(), despair },
    seed,
  );

  const hearthOf = (townId: string, fallback: Pt): Pt => {
    const t = layout.settlements.find((s) => s.id === townId);
    if (!t) return fallback;
    const f = tileFootWorld(t.q, t.r);
    return { x: f.x + HEARTH_OFFSET.x, y: f.y + HEARTH_OFFSET.y + 18 };
  };
  people.setSchedule((p) => {
    const ph = life.phase();
    const place = SCHED.phases.find((x) => ph < x.until)?.place ?? 'home';
    const h = hash(p.id);
    if (place === 'gather') {
      const c = hearthOf(p.town.id, p.home);
      const a = (h % 628) / 100;
      return { x: c.x + Math.cos(a) * 34, y: c.y + Math.sin(a) * 18 };
    }
    if (place === 'work' && h % 3 !== 0) {
      const spots = nodes.workSpots(p.town.id);
      return spots.length ? spots[h % spots.length]! : null;
    }
    return null;
  });

  return {
    update(time, dt, player) {
      nodes.update(player, time);
      living.update(time, dt);
      map.update(time);
    },
    onDawn() {
      nodes.refresh();
      living.refresh();
      inv.refresh();
    },
    gatherNear(player) {
      const n = nodes.nearest(player);
      if (!n) return null;
      const line = nodes.gather(n);
      inv.refresh();
      return line;
    },
    beforeDeed(methodId, personId) {
      const s = st();
      if (!s || !isGoodsDeed(methodId)) return { ok: true };
      const r = applyDeedGoods(s, methodId, personId);
      inv.refresh();
      living.refresh();
      return r ? { ok: r.ok, line: r.line } : { ok: true };
    },
    toggleInventory: () => inv.toggle(),
    toggleMap: () => map.toggle(),
    selectSlot: (i) => inv.select(i),
    overlayOpen: () => inv.isOpen() || map.isOpen(),
  };
}
