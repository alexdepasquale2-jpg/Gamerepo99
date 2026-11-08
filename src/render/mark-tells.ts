/** Persistent body tell for a person's strongest mark: a tiny glyph by their name. Pure (no Phaser). */

export type MarkTell = { markId: string; glyph: string; color: string };

/** One glyph + colour per mark. Order breaks stack ties: the heavier-to-carry mark shows first. */
const TELLS: readonly MarkTell[] = [
  { markId: 'dependence', glyph: '∞', color: '#e8a0c8' },
  { markId: 'resentment', glyph: '✕', color: '#d86a5a' },
  { markId: 'hollowness', glyph: '○', color: '#9aa0a8' },
  { markId: 'fragile_hope', glyph: '◇', color: '#f2d48a' },
  { markId: 'genuine_growth', glyph: '✦', color: '#f2b84b' },
];

/** The tell for the mark with the most stacks (ties by TELLS order); null when unmarked or unknown. */
export function strongestMarkTell(marks: readonly { markId: string; stacks: number }[] | undefined): MarkTell | null {
  let best: MarkTell | null = null;
  let bestStacks = 0;
  for (const t of TELLS) {
    const stacks = (marks ?? []).filter((m) => m.markId === t.markId).reduce((a, m) => a + m.stacks, 0);
    if (stacks > bestStacks) {
      best = t;
      bestStacks = stacks;
    }
  }
  return best;
}
