/** Named village jobs. A person's job is derived from the seed (no saved state), and sets what working alongside them yields. */

import jobsJson from '../../data/items/jobs.json';
import { deriveRng } from '../rng';
import type { SimState } from '../types/runtime';

export type Recipe = { in?: Record<string, number>; out: Record<string, number>; chance?: number };
export type Job = { id: string; name: string; yield: { itemId: string; qty: number; chance?: number }[]; recipes: Recipe[] };
export const JOBS = (jobsJson as { jobs: Job[] }).jobs;

export function jobOf(state: SimState, personId: string): Job {
  return JOBS[deriveRng(state.seed, 'job', personId).int(0, JOBS.length)]!;
}
