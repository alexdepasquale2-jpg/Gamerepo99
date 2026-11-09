import type { GameContext } from '../../app/contracts';
import type { SimState } from '../../sim/types/runtime';

/** One dawn's vitals, recorded for the god menu's charts. */
export type Sample = {
  day: number; spark: number; coin: number; people: number; avgFlame: number; lit: number;
  goods: number; carts: number; wars: number; despair: number; households: number; plans: number;
};
export type JuiceLine = { n: number; day: number; id: string; payload: unknown };

/** What every god-menu tab gets. */
export type God = {
  ctx: GameContext;
  state: () => SimState | undefined;
  /** After a mutation: tell the game (redraw world, HUD, people), re-render this tab, and toast `msg`. */
  commit: (msg?: string) => void;
  rerender: () => void;
  toast: (msg: string) => void;
  history: Sample[];
  juice: JuiceLine[];
  /** Per-tab memory across re-renders (filters, selection, sort). */
  memo: Record<string, unknown>;
  threshold: () => number;
};

export type Tab = { id: string; label: string; render: (g: God, body: HTMLElement) => void };
