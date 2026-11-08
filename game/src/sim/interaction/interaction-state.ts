/** Per-person runtime state for the interaction model. */
export interface InteractionPerson {
  id: string;
  flame01: number;
  trust: number;
  marks: Record<string, number>;
  touchScore: number;
  presence: number;
  bond: number;
  spark: number;
  kindsTouched?: string[];
  promises?: { id: string; status: PromiseStatus }[];
  /** Set once a harm-ripple interaction lands after the first show_up. */
  harmSinceShowUp?: boolean;
}

export type PromiseStatus = 'pending' | 'kept' | 'broken';

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
