/**
 * The year as the land shows it: which season a day falls in and the day's weather, both read off the day
 * number and the seed (nothing stored, so saves are untouched and every client sees the same sky).
 * The economy keeps its own clock; this is what the world layer paints (snow, falling leaves, rain) and
 * what people can remark on. Pure + deterministic: no Phaser, no Math.random.
 */
import { deriveRng } from './rng';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'rain' | 'snow' | 'wind';

/** Days in a season: a short year, so a player who waits or travels sees the land turn. */
export const DAYS_PER_SEASON = 7;
export const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Day 1 is early spring. */
export const seasonOf = (day: number): Season => SEASONS[Math.floor(Math.max(0, day - 1) / DAYS_PER_SEASON) % 4]!;

/** 0 at a season's first day, toward 1 at its last (for easing the palette between seasons). */
export const seasonPart = (day: number): number => (Math.max(0, day - 1) % DAYS_PER_SEASON) / DAYS_PER_SEASON;

/** Chance of a wet day by season; winter's wet days fall as snow. */
const WET: Record<Season, number> = { spring: 0.4, summer: 0.15, autumn: 0.35, winter: 0.55 };
const WINDY: Record<Season, number> = { spring: 0.1, summer: 0.05, autumn: 0.35, winter: 0.1 };

export function weatherOf(seed: number, day: number): Weather {
  const s = seasonOf(day);
  const r = deriveRng(seed, 'weather', day).next();
  if (r < WET[s]) return s === 'winter' ? 'snow' : 'rain';
  if (r < WET[s] + WINDY[s]) return 'wind';
  return 'clear';
}
