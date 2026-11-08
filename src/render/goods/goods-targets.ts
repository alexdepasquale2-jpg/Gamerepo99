/**
 * The goods layer's things as focus candidates (nodes, facilities, noticeboards, wagons, stash chests,
 * things on the ground), and what each one's verb shows once session.act has resolved it.
 */
import type Phaser from 'phaser';
import type { ActOutcome } from '../../sim/play-session/action-providers';
import type { Target, TargetKind } from '../../sim/play-session/targets';
import type { FocusCandidate } from '../interact/focus';
import type { FacilitiesLayer } from './facilities-layer';
import type { NodesLayer } from './nodes-layer';

type Pt = { x: number; y: number };

export const CHEST_REACH = 44;
export const GROUND_REACH = 40;
const BOARD_REACH = 50;
const WAGON_REACH = 65;

export type GoodsTargetParts = {
  nodes: NodesLayer;
  facilities: FacilitiesLayer;
  boards: { spots: () => { id: string; p: Pt }[] };
  wagons: () => (Pt & { id: string })[];
  chests: () => Map<string, Phaser.GameObjects.Image>;
  ground: () => Map<string, Phaser.GameObjects.Arc>;
  townName: (townId: string) => string;
};

/** Every goods thing within reach of the player (positions only; verbs are listed for the focus alone). `all`: every one loaded (QA). */
export function goodsCandidates(o: GoodsTargetParts, player: Pt, all = false): FocusCandidate[] {
  const out: FocusCandidate[] = [];
  const near = (a: Pt, b: Pt, r: number): boolean => all || (Math.abs(a.x - b.x) <= r && Math.abs(a.y - b.y) <= r);
  for (const v of o.nodes.inReach(player, all)) {
    out.push({ kind: 'node', id: v.node.id, x: v.pos.x, y: v.pos.y, reach: 40, data: v.node, anchor: { x: v.pos.x, y: v.pos.y - v.sprite.displayHeight - 2 } });
  }
  for (const f of o.facilities.spots()) {
    if (near(f, player, f.reach)) out.push({ kind: 'facility', id: f.id, x: f.x, y: f.y, reach: f.reach, data: { nameOf: o.townName }, anchor: { x: f.x, y: f.top } });
  }
  for (const b of o.boards.spots()) {
    if (near(b.p, player, BOARD_REACH)) out.push({ kind: 'board', id: b.id, x: b.p.x, y: b.p.y, reach: BOARD_REACH, anchor: { x: b.p.x, y: b.p.y - 50 } });
  }
  for (const w of o.wagons()) {
    if (near(w, player, WAGON_REACH)) out.push({ kind: 'wagon', id: w.id, x: w.x, y: w.y, reach: WAGON_REACH, anchor: { x: w.x, y: w.y - 40 } });
  }
  for (const [siteId, img] of o.chests()) {
    if (near(img, player, CHEST_REACH)) out.push(chestCandidate(siteId, img));
  }
  for (const [id, c] of o.ground()) {
    if (near(c, player, GROUND_REACH)) out.push(groundCandidate(id, c));
  }
  return out;
}

export const chestCandidate = (siteId: string, at: Pt): FocusCandidate =>
  ({ kind: 'chest', id: siteId, x: at.x, y: at.y, reach: CHEST_REACH, anchor: { x: at.x, y: at.y - 40 } });
export const groundCandidate = (id: string, at: Pt): FocusCandidate =>
  ({ kind: 'ground-item', id, x: at.x, y: at.y, reach: GROUND_REACH, anchor: { x: at.x, y: at.y - 10 } });

export type GoodsPresent = {
  say: (line: string) => void;
  openBoard: (townId: string) => void;
  openTrade: (caravanId: string) => void;
  /** A shift took this many hours: the day moves on. */
  shiftHours: (hours: number) => void;
  refreshInventory: () => void;
  refreshChests: () => void;
  refreshGround: () => void;
};

/** What a goods thing's verb shows after it resolved. False for kinds this layer does not own. */
export function presentGoodsVerb(
  o: GoodsTargetParts, p: GoodsPresent, kind: TargetKind, _verb: string, target: Target, out: ActOutcome | undefined,
): boolean {
  switch (kind) {
    case 'node':
      o.nodes.gathered(target.id, !!out?.ok);
      p.refreshInventory();
      if (out?.line) p.say(out.line);
      return true;
    case 'facility':
      o.facilities.worked(target.id, !!out?.ok);
      if (out?.line) p.say(out.line);
      if (out?.ok && out.hours) p.shiftHours(out.hours);
      p.refreshInventory();
      return true;
    case 'board':
      p.openBoard(target.id);
      return true;
    case 'wagon':
      p.openTrade(target.id);
      return true;
    case 'chest':
      p.refreshChests();
      p.refreshInventory();
      if (out?.line) p.say(out.line);
      return true;
    case 'ground-item':
      p.refreshGround();
      p.refreshInventory();
      if (out?.line) p.say(out.line);
      return true;
    default:
      return false;
  }
}
