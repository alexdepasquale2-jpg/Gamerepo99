/** Wires inventory, resource nodes, schedules, living world and maps into the overworld scene. */

import Phaser from 'phaser';
import type { PlaySession } from '../../sim';
import type { FabricWorld } from '../../sim/gen/world-types';
import type { WorldLayout } from '../../sim/map/world-layout';
import { applyDeedGoods, isGoodsDeed } from '../../sim/goods/deed-goods';
import { tileFootWorld } from '../depth-sort';
import { HEARTH_OFFSET, type WorldLife } from '../world-life';
import type { PeopleLayer } from '../people-layer';
import { hash } from '../people-layer';
import { createNodesLayer } from './nodes-layer';
import { createStashChests } from './stash-chest';
import { createInventoryUi } from './inventory-ui';
import { createWorldMap } from './world-map';
import { useItem, resolveDrop, dropItem, pickUpItem } from '../../sim/goods/item-use';
import { ITEM_BY_ID } from '../../sim/goods/inventory';
import { createNeedsBoards } from './needs-board';
import { createCorrespondence } from './correspondence-ui';
import { FEEL, handoffPath } from '../feel';
import { playSfx } from '../sfx';
import { unreadReplies } from '../../sim/letter-replies';
import { createCaravanTrade } from './caravan-trade-ui';
import { createLivingWorld } from './living-world';
import type { Navigator } from '../../sim/map/nav';
import { townBuildings, type Building } from '../../sim/map/interiors';
import { placeAt, residences } from '../../sim/map/residency';

type Pt = { x: number; y: number };
export type OverworldGoods = {
  update: (time: number, dt: number, player: Pt) => void;
  onDawn: () => void;
  /** Call after any session.act: stash acts change chests and carried goods. */
  onAct: () => void;
  /** Try gathering a nearby node. Returns a line when something happened. */
  gatherNear: (player: Pt) => string | null;
  /** Item side of a deed before it resolves; ok=false blocks the deed. */
  beforeDeed: (methodId: string, personId: string, itemId?: string) => { ok: boolean; line?: string };
  useSelected: (indoors?: boolean) => string | null;
  letters: () => void;
  readBoard: (player: Pt) => boolean;
  meetCaravan: (player: Pt) => boolean;
  closeOverlays: () => void;
  toggleInventory: () => void;
  toggleMap: () => void;
  selectSlot: (i: number) => void;
  overlayOpen: () => boolean;
};

export function attachOverworldGoods(
  scene: Phaser.Scene, session: PlaySession, world: FabricWorld, layout: WorldLayout,
  people: PeopleLayer, life: WorldLife, getPlayer: () => Pt, nav?: Navigator, say: (line: string) => void = () => {}, indoors: () => boolean = () => false,
): OverworldGoods {
  const seed = session.getSeed();
  const st = () => session.getState();
  const nodes = createNodesLayer(scene, st, seed, layout.settlements, layout.routes);
  const despair = () => session.townDespair();
  // Hotbar drag: villagers within reach light up; drop on one = gift, elsewhere = set the item on the ground.
  const REACH = 26;
  const personAt = (wx: number, wy: number): string | undefined => {
    let best: string | undefined, bd = REACH;
    for (const p of people.people) {
      if (p.inside || !p.sprite.visible) continue;
      const d = Math.hypot(p.sprite.x - wx, p.sprite.y - 14 - wy);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  };
  let lit: string | undefined;
  let litPrev: number | undefined;
  const light = (id?: string): void => {
    if (lit === id) return;
    const was = lit && people.byId.get(lit)?.sprite;
    if (was) { if (litPrev === undefined) was.clearTint(); else was.setTint(litPrev); }
    lit = id;
    const sp = id ? people.byId.get(id)?.sprite : undefined;
    litPrev = sp?.isTinted ? sp.tintTopLeft : undefined;
    sp?.setTint(0xffe38a);
  };
  const groundViews = new Map<string, Phaser.GameObjects.Arc>();
  const showGround = (): void => {
    const live = st()?.groundItems ?? [];
    for (const [id, v] of groundViews) if (!live.some((g) => g.id === id)) { v.destroy(); groundViews.delete(id); }
    for (const g of live) {
      if (groundViews.has(g.id)) continue;
      const c = scene.add.circle(g.x, g.y, 5, parseInt((ITEM_BY_ID.get(g.itemId)?.color ?? '#f4e6c8').slice(1), 16)).setStrokeStyle(1, 0x1b1612).setDepth(g.y).setName('ground-item').setInteractive({ useHandCursor: true });
      c.on('pointerdown', () => {
        const s = st();
        if (!s || Math.hypot(g.x - getPlayer().x, g.y - getPlayer().y) >= 70) { say('Too far to pick up.'); return; }
        if (pickUpItem(s, g.id)) inv.refresh();
        showGround();
      });
      groundViews.set(g.id, c);
    }
  };
  const inv = createInventoryUi(scene, st, {
    move: (itemId, wx, wy) => light(itemId && itemId !== 'coin' && !indoors() ? personAt(wx, wy) : undefined),
    drop: (itemId, wx, wy) => {
      const s = st();
      if (!s) return;
      if (indoors()) { say('Step outside to give or set things down.'); return; }
      const pid = itemId === 'coin' ? undefined : personAt(wx, wy);
      const act = resolveDrop({ itemId, qty: 1 }, pid ? { kind: 'person', id: pid } : { kind: 'ground' });
      if (act.kind === 'gift_give') {
        const r = api.beforeDeed('gift_give', act.personId, act.itemId);
        if (r.line) say(r.line);
        if (r.ok) { session.act(`gift_give@${act.personId}`); api.onAct(); }
      } else if (act.kind === 'drop' && dropItem(s, itemId, { x: wx, y: wy })) {
        showGround(); inv.refresh(); say(`You set down the ${ITEM_BY_ID.get(itemId)?.name ?? itemId}.`);
      }
    },
  });
  const mail = createCorrespondence(scene, st, () => inv.refresh());
  const chests = createStashChests(scene, st, layout.settlements, () => inv.refresh());
  const memories = new Map<string, Phaser.GameObjects.Text>();
  // Unread-reply marker under the control hint; hidden when nothing is waiting in the L panel.
  const badge = scene.add.text(12, 62, '', { fontFamily: 'Georgia, serif', fontSize: '12px', color: '#ffd877', stroke: '#1b1612', strokeThickness: 3 }).setScrollFactor(0).setDepth(1_000_000).setVisible(false);
  const trader = createCaravanTrade(scene, st, () => inv.refresh());
  const living = createLivingWorld(scene, seed, layout.settlements, layout.routes, st, despair, trader.stoppedId, nav);
  const meta = new Map((world.settlements ?? []).map((s) => [s.id, s]));
  const boards = createNeedsBoards(scene, session, layout, new Map([...meta].map(([id, s]) => [id, s.name])), getPlayer);
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
  // Residency: each town's people are dealt one per enterable building; the day phase decides who is indoors.
  const homes = new Map<string, Building>();
  for (const t of layout.settlements) {
    const bs = townBuildings(t);
    const ids = session.listPeople().filter((p) => p.townId === t.id).map((p) => p.id);
    for (const [pid, b] of residences(bs, ids)) homes.set(pid, b);
  }
  people.setResidency(() => life.phase(), homes);
  people.setSchedule((p) => {
    const ph = life.phase();
    const place = placeAt(ph);
    const h = hash(p.id);
    if (place === 'gather') {
      const c = hearthOf(p.town.id, p.home);
      const a = (h % 628) / 100;
      return { x: c.x + Math.cos(a) * 34, y: c.y + Math.sin(a) * 18 };
    }
    // A few villagers forage past the town edge (fishing banks, wild nodes); pathing wades fords/bridges.
    if (place === 'work' && h % 7 === 0) {
      const far = nodes.outskirtSpots(p.town.id);
      if (far.length) return far[h % far.length]!;
    }
    if (place === 'work' && h % 3 !== 0) {
      const spots = nodes.workSpots(p.town.id);
      return spots.length ? spots[h % spots.length]! : null;
    }
    return null;
  });

  let lastUnread = st() ? unreadReplies(st()!) : 0;
  scene.events.once('shutdown', () => { delete document.body.dataset.hfLocalOverlay; });
  showGround();
  const api: OverworldGoods = {
    update(time, dt, player) {
      document.body.dataset.hfLocalOverlay = String(inv.isOpen() || map.isOpen() || trader.isOpen() || mail.isOpen() || boards.isOpen());
      nodes.update(player, time);
      living.update(time, dt);
      map.update(time);
      const cur = st(), unread = cur ? unreadReplies(cur) : 0;
      if (unread > lastUnread) playSfx('letter');
      lastUnread = unread;
      badge.setVisible(unread > 0 && !mail.isOpen()).setText(`✉ ${unread} unread ${unread === 1 ? 'reply' : 'replies'} · L`);
      for (const townId of Object.keys(st()?.hearthKeepsakes ?? {})) if (!memories.has(townId)) {
        const p = hearthOf(townId, { x: 0, y: 0 });
        memories.set(townId, scene.add.text(p.x + 20, p.y - 24, '◆', { color: '#f2b84b', fontSize: '16px', stroke: '#503c25', strokeThickness: 2 }).setDepth(p.y + 1));
      }
    },
    onAct() {
      chests.refresh();
      inv.refresh();
    },
    onDawn() {
      nodes.refresh();
      chests.refresh();
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
    beforeDeed(methodId, personId, itemId) {
      const s = st();
      if (!s || !isGoodsDeed(methodId)) return { ok: true };
      const r = applyDeedGoods(s, methodId, personId, itemId ?? inv.selectedItem());
      inv.refresh();
      living.refresh();
      if (r?.ok && r.itemId && people.byId.has(personId)) {
        const it = ITEM_BY_ID.get(r.itemId), from = getPlayer(), to = people.headOf(personId);
        const icon = scene.add.circle(from.x, from.y - 24, 5, parseInt((it?.color ?? '#f4e6c8').slice(1), 16)).setStrokeStyle(1, 0x1b1612).setDepth(1_000_000);
        icon.setName('handoff');
        const clock = { t: 0 };
        // Item flies from the player to the villager.
        scene.tweens.add({ targets: clock, t: 1, duration: FEEL.handoff.ms, onUpdate: () => { const p = handoffPath({ x: from.x, y: from.y - 24 }, { x: to.x, y: to.y }, clock.t); icon.setPosition(p.x, p.y); }, onComplete: () => icon.destroy() });
      }
      return r ? { ok: r.ok, line: r.line } : { ok: true };
    },
    useSelected(indoors = false) {
      const s = st(), id = inv.selectedItem();
      if (!s || !id) return 'Select an item in your satchel.';
      if (ITEM_BY_ID.get(id)?.use?.correspondence) { mail.open(); return null; }
      const message = useItem(s, id, indoors ? undefined : life.nearestHearth(getPlayer())?.town.id);
      inv.refresh(); return message;
    },
    letters: () => mail.open(),
    readBoard: (player) => boards.interact(player),
    meetCaravan(player) {
      const id = living.nearestCaravan(player);
      if (!id) return false;
      trader.open(id); return true;
    },
    closeOverlays: () => { trader.close(); boards.close(); inv.close(); mail.close(); if (map.isOpen()) map.toggle(); },
    toggleInventory: () => inv.toggle(),
    toggleMap: () => map.toggle(),
    selectSlot: (i) => inv.select(i),
    overlayOpen: () => inv.dragging() || inv.isOpen() || map.isOpen() || trader.isOpen() || mail.isOpen() || boards.isOpen(),
  };
  return api;
}
