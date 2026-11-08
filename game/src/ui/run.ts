/**
 * The bridge between the title flow (one per page) and the ui attached to each run (one per Phaser
 * game). attachUi registers the run here; the flow ends it before starting another or going to the
 * title, so the old run's DOM never outlives it (Phaser destroys games a frame late).
 */
import type { GameContext } from '../app/contracts';

export type FlowControls = {
  /** Open the pause menu (Esc, ☰, touch Menu). */
  pause: () => void;
  /** Leave to the title (after "Let it rest"). */
  title: () => void;
};

type Run = { ctx: GameContext; destroy: () => void };

let flow: FlowControls | null = null;
let run: Run | null = null;

export const setFlow = (f: FlowControls): void => void (flow = f);
export const getFlow = (): FlowControls | null => flow;

export function beginRun(ctx: GameContext, destroy: () => void): Run {
  endRun();
  run = { ctx, destroy };
  return run;
}

/** Tear down the current run's ui (idempotent). With `only`, only if that run is still current. */
export function endRun(only?: Run): void {
  if (!run || (only && run !== only)) return;
  const r = run;
  run = null;
  try {
    r.destroy();
  } catch (err) {
    console.error('ui teardown failed', err);
  }
}

export const currentCtx = (): GameContext | null => run?.ctx ?? null;
