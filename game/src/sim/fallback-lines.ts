/**
 * Sim-side fallback lines: a key of data/dialogue/surface-fallbacks.json `talk` expanded with sim/grammar.ts
 * and the file's shared rules. voice/reaction-lines.ts keeps a per-run counter so a person moves on through
 * their pool; sim readers must not (saves and replays would drift), so here the line is a pure function of
 * the key and the caller's seed string. Callers build that seed from what they already seeded on
 * (state.seed, day, town or person id), so the same state always says the same thing.
 */
import fallbackJson from '../data/dialogue/surface-fallbacks.json';
import { expandGrammar, isGrammar, type GrammarRules, type LinePool } from './grammar';

type FallbackFile = { talk: Record<string, LinePool>; rules: GrammarRules };
const FILE = fallbackJson as unknown as FallbackFile;

/**
 * One line for `key`, or '' when the key is missing or nothing fits. Slots are plain values ({body},
 * {town}, {days}...); an option needing a slot the caller left empty is skipped, and `tags` switch on
 * options marked `when` (e.g. a ledger with nobody to name).
 */
export function fallbackLine(key: string | undefined, seed: string, slots: Record<string, string | undefined> = {}, tags: readonly string[] = []): string {
  const pool = key ? FILE.talk[key] : undefined;
  if (!pool) return '';
  // A plain list reads as a grammar with one rule-free frame per line, so both kinds skip the same way.
  const g = isGrammar(pool) ? pool : { frames: pool };
  return expandGrammar(g, FILE.rules, { slots, tags }, `${key}|${seed}`);
}

/**
 * The grammar capitalises a line's first letter; a line said after "Bren says " is a clause and starts low.
 * "I" stays up.
 */
export const asClause = (s: string): string => (/^I\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
