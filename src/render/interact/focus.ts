/**
 * The one focus resolver: of every interactable thing in reach, pick the single one in front of the player.
 * E, Enter and a tap act on it, and the one world prompt is drawn over it. Pure (no Phaser), so the
 * priority rules are unit-tested.
 *
 * Rule: the nearest thing wins, where a thing behind the player counts as farther away than it is
 * (BEHIND_MUL, plus BEHIND_PX). Things within TIE_PX of each other are a tie, settled by kind
 * (KIND_PRIORITY), then by id, so the same scene always gives the same answer.
 */
import type { TargetKind, TargetRef } from '../../sim/play-session/targets';

type Pt = { x: number; y: number };
export type FocusCandidate = TargetRef & {
  /** Where the thing stands (world px): distance is measured to here. */
  x: number;
  y: number;
  /** How close the player must be (px) for this thing to take focus. */
  reach: number;
  /** Scene data the sim needs for this target (a resource node's tile and kind, a door's interior kind). */
  data?: unknown;
  /** Where the prompt and ring sit (defaults to x, y). */
  anchor?: Pt;
};

/** Ties go to the thing earlier in this list (board and signpost first, the hearth last, as E always did). */
export const KIND_PRIORITY: readonly TargetKind[] = [
  'board', 'signpost', 'wagon', 'facility', 'door', 'person', 'chest', 'ground-item', 'node', 'plot', 'fauna', 'tile', 'hearth',
];
export const TIE_PX = 8;
const BEHIND_MUL = 1.5;
const BEHIND_PX = 12;

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
export function pickFocus<C extends FocusCandidate>(cands: readonly C[], player: Pt, facing: { dx: number; dy: number }): C | null {
  const inReach = cands
    .filter((c) => Math.hypot(c.x - player.x, c.y - player.y) <= c.reach)
    .map((c) => ({ c, s: focusScore(c, player, facing) }));
  if (!inReach.length) return null;
  const best = Math.min(...inReach.map((x) => x.s));
  const tied = inReach.filter((x) => x.s - best <= TIE_PX).map((x) => x.c);
  tied.sort((a, b) => rank(a.kind) - rank(b.kind) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return tied[0]!;
}
