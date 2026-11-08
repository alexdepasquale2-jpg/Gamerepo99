/**
 * Fragment grammar: a small Tracery-style expander so a handful of authored fragments give dozens of lines.
 *   - A grammar is `frames` (whole-line templates) plus `rules` (name → options).
 *   - `#rule#` expands one option of that rule, recursively (local rules first, then the shared ones);
 *     `#rule.cap#` capitalises the result. Depth is capped so a looping rule ends instead of hanging.
 *   - `{slot}` is filled from the context (given name, town, kin, job, patron, line...). An option that
 *     needs a slot the context lacks is skipped, so authors always keep a slot-free option per rule.
 *   - `{ text, when: [tags] }` only applies when the context carries one of those tags.
 * Seeded by a string/number key: the same key gives the same line; callers vary the key to vary the line.
 * Pure: no DOM, no Math.random.
 */
import { createRng, type Rng } from './rng';

export type GrammarOption = string | { text: string; when?: readonly string[] };
export type GrammarRules = Record<string, readonly GrammarOption[]>;
export type Grammar = { frames: readonly GrammarOption[]; rules?: GrammarRules };
export type GrammarCtx = { slots?: Record<string, string | undefined>; tags?: readonly string[] };
/** What a fallback key holds: the old plain list, or a grammar. */
export type LinePool = readonly string[] | Grammar;

/** Deep enough for frame → core → aside → word; anything deeper is an authoring loop. */
export const MAX_DEPTH = 6;

const REF = /#(\w+)(\.cap)?#/g;
const SLOT = /\{(\w+)\}/g;

export const isGrammar = (p: unknown): p is Grammar =>
  !!p && typeof p === 'object' && !Array.isArray(p) && Array.isArray((p as Grammar).frames);

/** FNV-1a over the key's text: stable across runs and platforms. */
export function hashKey(key: string | number): number {
  let h = 0x811c9dc5;
  for (const ch of String(key)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const textOf = (o: GrammarOption): string => (typeof o === 'string' ? o : o.text);

function usable(o: GrammarOption, ctx: GrammarCtx): boolean {
  if (typeof o !== 'string' && o.when?.length && !o.when.some((t) => ctx.tags?.includes(t))) return false;
  for (const m of textOf(o).matchAll(SLOT)) if (!ctx.slots?.[m[1]!]) return false;
  return true;
}

function pick(opts: readonly GrammarOption[], ctx: GrammarCtx, rng: Rng): string | undefined {
  const ok = opts.filter((o) => usable(o, ctx));
  return ok.length ? textOf(ok[rng.int(0, ok.length)]!) : undefined;
}

const capFirst = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

type Env = { local?: GrammarRules; shared: GrammarRules; ctx: GrammarCtx; rng: Rng; onShared?: (rule: string) => void };

// Slots go in as marker tokens and take their values only after tidy(), so a name or an imported
// legend line is never read as grammar ('#', '{') nor re-cased or re-spaced.
const OPEN = '\u0001';
const CLOSE = '\u0002';
const TOKEN = /\u0001(\w+)\u0002/g;

function fill(text: string, env: Env, depth: number): string {
  const parts = text.split(REF);
  // split with two capture groups yields [text, name, cap, text, name, cap, ..., text]
  let out = '';
  for (let i = 0; i < parts.length; i += 3) {
    out += (parts[i] ?? '').replace(SLOT, (m, k: string) => (env.ctx.slots?.[k] ? OPEN + k + CLOSE : m));
    const name = parts[i + 1];
    if (name === undefined) continue;
    if (depth >= MAX_DEPTH) continue;
    const opts = env.local?.[name] ?? env.shared[name];
    const t = opts ? pick(opts, env.ctx, env.rng) : undefined;
    if (t !== undefined && !env.local?.[name]) env.onShared?.(name);
    const sub = t === undefined ? '' : fill(t, env, depth + 1);
    out += parts[i + 2] ? capFirst(sub) : sub;
  }
  return out;
}

/** Spacing and capitals after empty options drop out: "Well.  that" → "Well. That". */
function tidy(s: string): string {
  const t = s
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    // an ellipsis ("I feel... it's fine") is a pause, not a new sentence
    .replace(/(?<!\.)([.!?]) ([a-z])/g, (_, p: string, c: string) => `${p} ${c.toUpperCase()}`)
    // a core and a closer can end on the same words ("Thank you. Thank you."): say it once
    .replace(/(^|[.!?] )([^.!?]+[.!?])(?: \2)+(?= |$)/g, '$1$2')
    .trim();
  return capFirst(t);
}

/** One line from a grammar; '' when no frame fits the context. */
export function expandGrammar(
  g: Grammar,
  shared: GrammarRules,
  ctx: GrammarCtx,
  key: string | number,
  /** Told each shared rule the line actually used (proof-of-use tracking; never changes the line). */
  onShared?: (rule: string) => void,
): string {
  const rng = createRng(hashKey(key));
  const frame = pick(g.frames, ctx, rng);
  if (frame === undefined) return '';
  return tidy(fill(frame, { local: g.rules, shared, ctx, rng, onShared }, 0)).replace(TOKEN, (_, k: string) => ctx.slots?.[k] ?? '');
}
