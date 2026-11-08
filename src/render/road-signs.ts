/**
 * A signpost at each town's road end. E beside it opens the road menu; choosing runs the journey in the sim
 * (every road day is a world day), then the player arrives at the far town and hears how the road went.
 */
import Phaser from 'phaser';
import type { PlaySession } from '../sim';
import { coinOf, type JourneyResult } from '../sim/travel/journey';
import type { MenuHandle } from '../ui/kit/menu';
import { openRoadMenu } from '../ui/menus/road-menu';
import { playSfx } from './sfx';
import { tileFootWorld } from './depth-sort';
import { TILE_PX } from '../sim/map/constants';

type Pt = { x: number; y: number };
type Settlement = { id: string; q: number; r: number };

export type RoadsHandle = {
  isOpen: () => boolean;
  busy: () => boolean;
  /** E pressed: open the road menu if the player is at a signpost. */
  interact: (p: Pt) => boolean;
  /** Signpost tile (q, r) of a town — for tests/dev teleport. */
  signpost: (townId: string) => { q: number; r: number } | null;
  /** Run a journey as if picked from the menu; resolves when the arrival lines start. */
  travel: (routeId: string, tradeId?: string) => Promise<JourneyResult | null>;
  close: () => void;
};

export function attachRoads(o: {
  scene: Phaser.Scene;
  session: PlaySession;
  settlements: Settlement[];
  nameOf: (townId: string) => string;
  arriveAt: (townId: string) => void;
  /** After the world moved on (people, goods, autosave, spark HUD). */
  afterJourney: () => void;
  say: (text: string) => void;
  setBusy: (busy: boolean) => void;
}): RoadsHandle {
  const { scene, session } = o;
  const font = { fontFamily: 'monospace', fontSize: '10px', color: '#efdfb9', stroke: '#1b1612', strokeThickness: 3 };
  const spots = o.settlements.map((t) => {
    const tile = { q: Math.round(t.q + 3.5), r: Math.round(t.r + 3.2) };
    const p = tileFootWorld(t.q + 3.5, t.r + 3.2);
    const g = scene.add.graphics().setDepth(p.y);
    g.fillStyle(0x59412d).fillRect(p.x - 2, p.y - 50, 5, 52);
    // Two arms pointing opposite ways down the road.
    g.fillStyle(0xa87643).fillTriangle(p.x + 30, p.y - 42, p.x + 22, p.y - 48, p.x + 22, p.y - 36).fillRect(p.x - 2, p.y - 48, 24, 12);
    g.fillStyle(0x93653a).fillTriangle(p.x - 28, p.y - 26, p.x - 20, p.y - 32, p.x - 20, p.y - 20).fillRect(p.x - 20, p.y - 32, 22, 12);
    g.lineStyle(1, 0x68472e).strokeRect(p.x - 2, p.y - 48, 24, 12).strokeRect(p.x - 20, p.y - 32, 22, 12);
    scene.add.text(p.x, p.y + 5, 'Roads · E', font).setOrigin(0.5, 0).setDepth(p.y + 1);
    return { id: t.id, p, tile };
  });
  let menu: MenuHandle | null = null;
  let travelling = false;

  const close = (): void => {
    menu?.close();
    menu = null;
  };

  const travel = (routeId: string, tradeId?: string): Promise<JourneyResult | null> =>
    new Promise((done) => {
      if (travelling) return done(null);
      close();
      const res = session.journey(routeId, tradeId);
      if (!res?.ok) {
        o.say(res?.reason === 'cant_pay' ? 'You haven’t the warmth to spare for that.' : 'Not that road, not today.');
        return done(res);
      }
      travelling = true;
      o.setBusy(true);
      const cam = scene.cameras.main;
      cam.fadeOut(600, 8, 8, 20);
      cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        o.arriveAt(res.toId!);
        o.afterJourney();
        scene.time.delayedCall(300, () => {
          cam.fadeIn(800, 8, 8, 20);
          cam.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => {
            travelling = false;
            o.setBusy(false);
            playSfx('dawn');
            o.say(`Day ${session.snapshot().day}. ${o.nameOf(res.toId!)}.`);
            res.lines.forEach((line, i) => scene.time.delayedCall(2600 * (i + 1), () => o.say(line)));
            done(res);
          });
        });
      });
    });

  const open = (townId: string): void => {
    const st = session.getState();
    if (!st) return;
    close();
    menu = openRoadMenu(o.nameOf(townId), session.roads(), {
      nameOf: o.nameOf,
      spark: st.player.spark,
      coin: coinOf(st),
      onPick: (routeId, tradeId) => void travel(routeId, tradeId),
      onClose: close,
    });
  };

  return {
    isOpen: () => !!menu?.el.isConnected,
    busy: () => travelling,
    interact(p) {
      const spot = spots.find((s) => Math.hypot(s.p.x - p.x, s.p.y - p.y) < TILE_PX * 1.8);
      if (!spot) return false;
      // You leave from where you stand: the signpost belongs to this town.
      const st = session.getState();
      if (st) st.player.townId = spot.id;
      open(spot.id);
      return true;
    },
    signpost: (townId) => spots.find((s) => s.id === townId)?.tile ?? null,
    travel,
    close,
  };
}
