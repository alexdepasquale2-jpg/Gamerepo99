/**
 * The one focus resolver: of every interactable thing in reach, pick the single one in front of the player.
 * E, Enter and the touch Act button act on it, and the one world prompt is drawn over it. Pure maths over
 * Things (no Phaser, no verbs): verbs are listed for the winner alone, never for every candidate.
 *
 * Rule: the nearest thing wins, where a thing behind the player counts as farther away than it is
 * (BEHIND_MUL, plus BEHIND_PX). Things within TIE_PX of each other are a tie, settled by kind
 * (KIND_PRIORITY), then by key, so the same scene always gives the same answer.
 */
import type { Pt, Thing } from '../app/contracts';
import type { TargetKind } from '../sim/play-session/targets';

/** Ties go to the thing earlier in this list (board and signpost first, the hearth last). */
export const KIND_PRIORITY: readonly TargetKind[] = [
  'board', 'signpost', 'wagon', 'facility', 'door', 'person', 'chest', 'ground-item', 'node', 'plot', 'fauna', 'tile', 'hearth',
];
export const DEFAULT_REACH = 48;
/** How far around the player we ask the other areas for things (covers the longest reach). */
export const SCAN_RADIUS = 96;
export const TIE_PX = 8;
const BEHIND_MUL = 1.5;
const BEHIND_PX = 12;

export const reachOf = (t: Thing): number => t.reach ?? DEFAULT_REACH;
export const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Effective distance: a thing behind you (against your facing) counts as farther. */
export function focusScore(c: Pt, player: Pt, facing: { dx: number; dy: number }): number {
  const dx = c.x - player.x, dy = c.y - player.y;
  const d = Math.hypot(dx, dy);
  const f = Math.hypot(facing.dx, facing.dy);
  if (d < 1 || f === 0) return d;
  const cos = (dx * facing.dx + dy * facing.dy) / (d * f);
  return cos < -0.2 ? d * BEHIND_MUL + BEHIND_PX : d;
}

const rank = (k: TargetKind): number => {
  const i = KIND_PRIORITY.indexOf(k);
  return i < 0 ? KIND_PRIORITY.length : i;
};

/** The single thing in focus, or null when nothing is in reach. */
export function pickFocus(cands: readonly Thing[], player: Pt, facing: { dx: number; dy: number }): Thing | null {
  const inReach = cands.filter((c) => dist(c, player) <= reachOf(c)).map((c) => ({ c, s: focusScore(c, player, facing) }));
  if (!inReach.length) return null;
  const best = Math.min(...inReach.map((x) => x.s));
  const tied = inReach.filter((x) => x.s - best <= TIE_PX).map((x) => x.c);
  tied.sort((a, b) => rank(a.kind) - rank(b.kind) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return tied[0]!;
}

/** How close (px) a tap must land to a thing's foot, or to the middle of its body, to hit it. */
const HIT_PX = 20;
const BODY_UP = 14;

/** The thing under a tap (world px), nearest first; null for empty ground. */
export function thingAt(cands: readonly Thing[], p: Pt): Thing | null {
  let best: Thing | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    const d = Math.min(dist(c, p), dist({ x: c.x, y: c.y - BODY_UP }, p));
    if (d <= HIT_PX && (d < bestD || (d === bestD && best && rank(c.kind) < rank(best.kind)))) {
      best = c;
      bestD = d;
    }
  }
  return best;
}
