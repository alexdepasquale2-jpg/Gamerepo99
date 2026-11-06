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
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
