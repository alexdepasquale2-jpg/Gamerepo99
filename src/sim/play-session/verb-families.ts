/**
 * Verb families: how a thing's verbs fold into a ring of at most RING_MAX chips. Up to RING_MAX verbs show
 * as they are; past that the ring shows families first (Speak, Help, Give, Promise, Ask, Deal — deeds.json),
 * and a family chip opens its verbs. A family of one shows its verb directly. No paging, ever.
 * Pure data shaping: no Phaser/DOM.
 */
import deedsJson from '../../data/systems/interactions/deeds.json';
import catalogJson from '../../data/systems/interactions/catalog.json';

export const RING_MAX = 6;
/** Longest chip text; longer labels are cut at a word and the full label becomes the tip. */
export const SHORT_MAX = 16;

export type Verb = { id: string; label: string; short?: string; family?: string; savage?: boolean };
export type FamilyDef = { id: string; label: string; choiceSetId?: string; aliases?: string[] };
/** One ring chip: a verb (no `verbs`) or a family that opens its verbs. */
export type RingChip = { id: string; label: string; tip?: string; savage: boolean; family?: string; verbs?: RingChip[] };

type DeedMeta = { id: string; family?: string };
type ChoiceSet = { id: string; options?: { interactionId: string }[] };

export const FAMILIES: readonly FamilyDef[] = (deedsJson as { families?: FamilyDef[] }).families ?? [];
const DEED_FAMILY = new Map((deedsJson as { deeds: DeedMeta[] }).deeds.filter((d) => d.family).map((d) => [d.id, d.family!]));
const CHOICE_SETS = (catalogJson as { choiceSets?: ChoiceSet[] }).choiceSets ?? [];
export const OTHER_FAMILY: FamilyDef = { id: 'other', label: 'More' };

/** The verb part of an act id (`talk_gentle@jonah` → `talk_gentle`). */
const verbOf = (id: string): string => (id.includes('@') ? id.slice(0, id.indexOf('@')) : id);

/** Chip text: the verb's short label, else its label cut to SHORT_MAX at a word boundary. */
export function shortLabel(v: Pick<Verb, 'label' | 'short'>): string {
  const s = v.short ?? v.label;
  if (s.length <= SHORT_MAX) return s;
  const cut = s.slice(0, SHORT_MAX - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 6 ? cut.slice(0, sp) : cut).replace(/[\s,(·-]+$/, '')}…`;
}

/** Which family a verb belongs to: its own (through aliases), its deed's, the family whose choice set lists it, else 'other'. */
export function familyOf(v: Pick<Verb, 'id' | 'family'>, families: readonly FamilyDef[] = FAMILIES): string {
  const byAlias = (f: string | undefined): string | undefined =>
    f ? families.find((x) => x.id === f || x.aliases?.includes(f))?.id : undefined;
  const verb = verbOf(v.id);
  const own = byAlias(v.family) ?? byAlias(DEED_FAMILY.get(verb));
  if (own) return own;
  for (const f of families) {
    const cs = f.choiceSetId ? CHOICE_SETS.find((c) => c.id === f.choiceSetId) : undefined;
    if (cs?.options?.some((o) => o.interactionId === verb)) return f.id;
  }
  return OTHER_FAMILY.id;
}

const toChip = (v: Verb): RingChip => {
  const label = shortLabel(v);
  return { id: v.id, label, ...(label !== v.label ? { tip: v.label } : {}), savage: !!v.savage };
};

/**
 * Fold verbs into the top ring level (≤ RING_MAX chips). Order: families as deeds.json lists them, verbs
 * in the order given. Deterministic for the same input.
 */
export function groupVerbs(verbs: readonly Verb[], families: readonly FamilyDef[] = FAMILIES): RingChip[] {
  if (verbs.length <= RING_MAX) return verbs.map(toChip);
  const order = [...families, OTHER_FAMILY];
  const groups: { fam: FamilyDef; chips: RingChip[] }[] = [];
  for (const fam of order) {
    const chips = verbs.filter((v) => familyOf(v, families) === fam.id).map(toChip);
    // A family too big for one level splits into "Help", "Help 2", ... (never a More… page).
    for (let i = 0; i < chips.length; i += RING_MAX) {
      const n = i / RING_MAX;
      groups.push({ fam: n ? { ...fam, id: `${fam.id}${n + 1}`, label: `${fam.label} ${n + 1}` } : fam, chips: chips.slice(i, i + RING_MAX) });
    }
  }
  // Too many families for one ring: fold the two smallest neighbours together while they fit.
  while (groups.length > RING_MAX) {
    let best = -1;
    for (let i = 0; i + 1 < groups.length; i++) {
      const size = groups[i]!.chips.length + groups[i + 1]!.chips.length;
      if (size <= RING_MAX && (best < 0 || size < groups[best]!.chips.length + groups[best + 1]!.chips.length)) best = i;
    }
    if (best < 0) break;
    const [a, b] = [groups[best]!, groups[best + 1]!];
    groups.splice(best, 2, { fam: a.chips.length >= b.chips.length ? a.fam : b.fam, chips: [...a.chips, ...b.chips] });
  }
  if (groups.length > RING_MAX) {
    // Still too many (every neighbour pair overflows): repack in order into full chips of RING_MAX,
    // each named for the family it starts in. Holds up to RING_MAX² verbs without a page.
    const all = groups.flatMap((g) => g.chips.map((c) => ({ c, fam: g.fam })));
    groups.length = 0;
    for (let i = 0; i < all.length; i += RING_MAX) {
      const slice = all.slice(i, i + RING_MAX);
      const fam = slice[0]!.fam;
      const n = groups.filter((g) => g.fam.id.startsWith(fam.id)).length;
      groups.push({ fam: n ? { ...fam, id: `${fam.id}${n + 1}`, label: `${fam.label} ${n + 1}` } : fam, chips: slice.map((x) => x.c) });
    }
  }
  return groups.slice(0, RING_MAX).map(({ fam, chips }) =>
    chips.length === 1 ? chips[0]! : { id: `family:${fam.id}`, label: fam.label, savage: false, family: fam.id, verbs: chips },
  );
}

/** Every verb chip in a ring level, families opened (for lookups and dev hooks). */
export function flattenChips(chips: readonly RingChip[]): RingChip[] {
  return chips.flatMap((c) => (c.verbs ? c.verbs : [c]));
}
