/** Surfacing layer: reaction-line bubbles over people + per-town despair desaturation. Presentation only. */

import Phaser from 'phaser';
import type { PlaySession } from '../sim';
import { TILE_PX } from '../sim/map/constants';
import { createBubbleQueue, presentJuice, type Presentation } from '../ui/surface';
import { createTintAnimator } from './despair-tint';
import { FEEL } from './feel';
import { tileFootWorld } from './depth-sort';

type Settlement = { id: string; q: number; r: number };
const TINT_DEPTH = 900_000;
const BUBBLE_DEPTH = 999_000;

export type SurfaceHandle = {
  /** Test/QA hook: pin a town's despair on the presentation side only (null clears). */
  setDespairOverride: (townId: string, despair: number | null) => void;
  /** Test/QA hook: feed a juice event through the adapter as if the sim had emitted it. */
  feed: (id: string, payload: unknown) => void;
  tintOf: (townId: string) => number;
  /** QA: bubbles showing right now ({ personId, line }). */
  bubbles: () => { personId: string; line: string }[];
};

export function attachSurface(
  scene: Phaser.Scene,
  session: PlaySession,
  settlements: Settlement[],
  positionOf?: (personId: string) => { x: number; y: number } | undefined,
): SurfaceHandle {
  const queue = createBubbleQueue(FEEL.tint.bubbleMs);
  const anims = new Map(settlements.map((s) => [s.id, createTintAnimator()]));
  const overrides = new Map<string, number>();
  const overlays = new Map(settlements.map((s) => [s.id, scene.add.graphics().setDepth(TINT_DEPTH)]));
  const texts = new Map<string, Phaser.GameObjects.Text>();
  const pips = new Map<string, Phaser.GameObjects.Arc>();
  const townOf = new Map<string, string>();
  const refreshPeople = (): void => {
    for (const p of session.listPeople()) if (p.townId) townOf.set(p.id, p.townId);
  };
  refreshPeople();
  const lookedUp = new Set<string>();

  // Town-level lines go to someone the player can see: in that town (default: the player's), nearest the camera.
  const ctx = {
    nearbyPersonId: (townId?: string, excludeId?: string): string | undefined => {
      const town = townId ?? session.snapshot().townId;
      const folk = [...townOf].filter(([, t]) => t === town).map(([id]) => id);
      const pool = folk.filter((id) => id !== excludeId);
      const pick = pool.length ? pool : folk;
      if (!pick.length) return [...townOf.keys()][0];
      // The scene may be mid-restart (a world file was just imported): no camera, so take the first.
      const mid = scene.cameras?.main?.midPoint;
      if (!mid) return pick[0];
      let best = pick[0]!;
      let bd = Infinity;
      for (const id of pick) {
        const at = positionOf?.(id);
        const d = at ? Math.hypot(at.x - mid.x, at.y - mid.y) : Infinity;
        if (d < bd) { bd = d; best = id; }
      }
      return best;
    },
  };
  const retint = (): void => {
    const d = session.townDespair();
    for (const [id, a] of anims) a.setDespair(overrides.get(id) ?? d[id] ?? 0);
  };
  const handle = (id: string, payload: unknown): void => {
    const p: Presentation | null = presentJuice(id, payload, ctx);
    if (!p) return;
    if (p.kind === 'tint') retint();
    else queue.push(p);
  };
  const off = session.onJuice(handle);
  scene.events.once('shutdown', off);

  const anchor = (personId: string): { x: number; y: number } => {
    const live = positionOf?.(personId);
    if (live) return live;
    // Someone who came of age or arrived after boot: look them up once.
    if (!townOf.has(personId) && !lookedUp.has(personId)) { lookedUp.add(personId); refreshPeople(); }
    const town = settlements.find((s) => s.id === townOf.get(personId)) ?? settlements[0];
    if (!town) return { x: 0, y: 0 };
    let h = 0;
    for (const c of personId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const foot = tileFootWorld(town.q, town.r);
    return { x: foot.x + ((h % 5) - 2) * 18, y: foot.y - TILE_PX * 1.6 - (h % 3) * 14 };
  };

  const art = scene.children.list.filter((o) => o.getData('settlementTown')) as Phaser.GameObjects.Image[];
  let sincePoll = 0;
  scene.events.on('update', (_t: number, dt: number) => {
    sincePoll += dt;
    if (sincePoll > 250) {
      sincePoll = 0;
      retint();
      for (const img of art) {
        const sat = anims.get(img.getData('settlementTown') as string)?.value ?? 1;
        img.setTexture(`${img.getData('settlementPalette')}-${Math.min(4, Math.round((1 - sat) / 0.2))}`);
      }
    }
    queue.tick(dt);
    const radius = FEEL.tint.townRadiusTiles * TILE_PX;
    for (const s of settlements) {
      const sat = anims.get(s.id)!.update(dt);
      const g = overlays.get(s.id)!;
      g.clear();
      const c = tileFootWorld(s.q, s.r);
      for (let i = 4; i >= 1; i--) g.fillStyle(0x808080, (1 - sat) / 4).fillCircle(c.x, c.y, (radius * i) / 4);
    }
    const live = new Set<string>();
    for (const b of queue.active()) {
      live.add(b.personId);
      const pos = anchor(b.personId);
      let t = texts.get(b.personId);
      if (!t) {
        t = scene.add
          .text(0, 0, '', { fontFamily: 'monospace', fontSize: '10px', color: '#f2e9e4', backgroundColor: '#1b1612', padding: { x: 4, y: 2 }, wordWrap: { width: 170 } })
          .setOrigin(0.5, 1)
          .setDepth(BUBBLE_DEPTH);
        texts.set(b.personId, t);
      }
      t.setText(b.line).setPosition(pos.x, pos.y).setVisible(true);
      if (b.tell === 'ember') {
        let pip = pips.get(b.personId);
        if (!pip) pips.set(b.personId, (pip = scene.add.circle(0, 0, 3, FEEL.reignite.colorWarm).setDepth(BUBBLE_DEPTH)));
        pip.setPosition(pos.x - t.width / 2 - 6, pos.y - t.height / 2).setAlpha(0.5 + 0.4 * Math.sin(scene.time.now / 220)).setVisible(true);
      }
    }
    for (const [id, t] of texts) if (!live.has(id)) t.setVisible(false);
    for (const [id, pip] of pips) if (!live.has(id)) pip.setVisible(false);
  });

  return {
    setDespairOverride(townId, despair) {
      if (despair === null) overrides.delete(townId);
      else overrides.set(townId, despair);
      retint();
    },
    feed: handle,
    tintOf: (townId) => anims.get(townId)?.value ?? 1,
    bubbles: () => queue.active().map((b) => ({ personId: b.personId, line: b.line })),
  };
}
