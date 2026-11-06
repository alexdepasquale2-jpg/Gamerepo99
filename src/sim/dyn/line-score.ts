/** Fragment scoring + constraint checks for fabric line blend. Pure. */

export type Frag = {
  id: string;
  text: string;
  tags?: string[];
  weight?: number;
  slot?: string;
};

export type Constraint = {
  forbidTagsTogether?: string[][];
  neverContradict?: Array<{ ifMemory: string; forbidFragmentTag: string }>;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function violatesConstraints(
  frag: Frag,
  memory: Set<string>,
  constraints: Constraint[],
): boolean {
  const tags = new Set(frag.tags ?? []);
  for (const c of constraints) {
    for (const pair of c.forbidTagsTogether ?? []) {
      if (pair.every((t) => tags.has(t))) return true;
    }
    for (const rule of c.neverContradict ?? []) {
      if (memory.has(rule.ifMemory) && tags.has(rule.forbidFragmentTag)) return true;
    }
  }
  return false;
}

/** Score alone-slot fragment against curve influence + memory (+ axis:/mood tags). */
export function scoreFragment(
  frag: Frag,
  influence: Record<string, number>,
  memory: Set<string>,
  drives?: { trust: number; flame01: number; hollowness: number },
): number {
  let score = typeof frag.weight === 'number' ? frag.weight : 1;
  const tags = frag.tags ?? [];
  const trust = drives?.trust ?? 0.5;
  const flame01 = drives?.flame01 ?? 0.2;
  const hollowness = drives?.hollowness ?? 0;

  if (tags.includes('authored_anchor') || tags.includes('fallback_mirror')) score += 0.25;
  if (tags.includes('migration_verbatim')) score += 0.1;

  // Legacy mood/state tags
  if (tags.includes('mood:wary') || tags.includes('state:lonely') || tags.includes('axis:lonely')) {
    score += (1 - trust) * 2.2 + (influence.weariness ?? 0) + hollowness;
  }
  if (tags.includes('axis:trust_low')) score += (1 - trust) * 2.5;
  if (tags.includes('axis:spark_low')) score += (1 - flame01) * 2.2;
  if (tags.includes('axis:spark_high')) score += flame01 * 2.2;
  if (tags.includes('axis:mark_hollowness') || tags.includes('axis:mark_dependence')) {
    score += hollowness * 2.5;
    if (memory.has('mark:hollowness') || memory.has('mark:dependence')) score += 1.5;
  }
  if (tags.includes('axis:mark_shame') && memory.has('mark:shame')) score += 2;
  if (tags.includes('axis:mark_grief') && (memory.has('mark:grief') || memory.has('wound:grief'))) {
    score += 2;
  }
  if (tags.includes('axis:mark_resentment') && memory.has('mark:resentment')) score += 2;

  // Neutral mirrors: mild warmth preference when not axis-specialized
  const axisTagged = tags.some((t) => t.startsWith('axis:'));
  if (!axisTagged && !tags.includes('mood:wary') && !tags.includes('state:lonely')) {
    score += trust * 0.4 + flame01 * 0.3 + 0.35;
  }

  for (const t of tags) {
    if (!t.startsWith('mark:')) continue;
    if (memory.has(t)) score += 0.5;
  }
  return Math.max(0.01, score);
}

export { clamp01 };
