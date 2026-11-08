/**
 * Burnout edge watcher (pure; no Phaser). Decides when the overworld plays the dying-coal
 * burnout and when the succession overlay may open, so the player sees the coal go out first.
 */

export type BurnoutWatch = {
  /**
   * Feed the succession state once per frame. Returns true exactly once per opening:
   * on the first frame where `canPlay` is true.
   */
  step(open: boolean, canPlay: boolean, now: number): boolean;
  /**
   * Overlay gate: true when nothing is open, once the burnout has been on screen for holdMs,
   * or (fail-safe) once the offer has waited maxWaitMs without the burnout getting to play.
   */
  ready(open: boolean, now: number): boolean;
};

export function createBurnoutWatch(holdMs: number, maxWaitMs = 8000): BurnoutWatch {
  let played = false;
  let doneAt = Number.POSITIVE_INFINITY;
  let openedAt = Number.POSITIVE_INFINITY;
  return {
    step(open, canPlay, now) {
      if (!open) {
        played = false;
        doneAt = Number.POSITIVE_INFINITY;
        openedAt = Number.POSITIVE_INFINITY;
        return false;
      }
      if (openedAt === Number.POSITIVE_INFINITY) openedAt = now;
      if (played || !canPlay) return false;
      played = true;
      doneAt = now + holdMs;
      return true;
    },
    ready(open, now) {
      if (!open) return true;
      if (played) return now >= doneAt;
      return now - openedAt >= maxWaitMs;
    },
  };
}
