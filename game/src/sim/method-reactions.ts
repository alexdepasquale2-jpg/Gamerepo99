/** Refusal hooks + reaction-line selection. Pure sim; no module-level mutable selector. */

import { matchesWhen } from './hooks';
import type { DataTables } from './load-data';
import type { Rng } from './rng';
import type { EffectCtx } from './effects';
import type { HookDef } from './types/data';
import type { Inhabitant, SimState } from './types/runtime';
import { voiceOf } from './inhabitant';

export type MethodSimState = SimState & {
  data: DataTables;
  rng: Rng;
};

type Tell = { id: string; view?: string; durationTicks?: number };
type MethodRow = { id: string; family?: string; style?: string };
type RefusalHook = HookDef & { lineVoiceFrom?: string; tells?: Tell[] };

export type ReactionPickCtx = {
  personId: string;
  methodId: string;
  seed: number;
  state: MethodSimState;
  features: { bakedDynamismLines: boolean };
  /** This person's 0..1 kin strain across the gap; omitted = derived from state (social/kin-strain). */
  kinStrain?: number;
};
export type ReactionLineResult = {
  lineId: string;
  text: string;
  source: 'fixed' | 'blend' | 'fallback';
};
export type ReactionLineSelector = (ctx: ReactionPickCtx) => ReactionLineResult;

type Frag = {
  id: string;
  text: string;
  tags?: string[];
  slot?: string;
};

function isAloneSlot(f: Frag): boolean {
  const tags = f.tags ?? [];
  return f.slot === 'alone' || tags.includes('slot:alone');
}

/** Authored alone-slot fragment by person:+method: tags (fragments-only; no lines.json). */
export function pickFixedReactionLine(ctx: ReactionPickCtx): ReactionLineResult {
  const frags = (ctx.state.data.lineFragments?.fragments ?? []) as Frag[];
  const personTag = `person:${ctx.personId}`;
  const methodTag = `method:${ctx.methodId}`;
  const alone = frags.filter(
    (f) => isAloneSlot(f) && (f.tags ?? []).includes(personTag) && (f.tags ?? []).includes(methodTag),
  );
  const noAxis = alone.filter(
    (f) => !(f.tags ?? []).some((t) => String(t).startsWith('axis:')),
  );
  const pool = noAxis.length ? noAxis : alone;
  const preferred =
    pool.find((f) => (f.tags ?? []).includes('migration_verbatim')) ??
    pool.find((f) => (f.tags ?? []).includes('authored_anchor')) ??
    pool.find((f) => (f.tags ?? []).includes('fallback_mirror')) ??
    pool[0];
  if (preferred?.text) {
    return { lineId: preferred.id, text: preferred.text, source: 'fixed' };
  }
  return { lineId: `${ctx.personId}.${ctx.methodId}`, text: '', source: 'fallback' };
}

/** Set per-state selector; null resets to pickFixedReactionLine. No cross-state leaks. */
export function setReactionLineSelector(
  state: SimState,
  selector: ReactionLineSelector | null,
): void {
  (state as SimState & { reactionLineSelector?: ReactionLineSelector }).reactionLineSelector =
    selector ?? pickFixedReactionLine;
}

export function selectReactionLine(ctx: ReactionPickCtx): ReactionLineResult {
  const sel =
    (ctx.state as SimState & { reactionLineSelector?: ReactionLineSelector }).reactionLineSelector ??
    pickFixedReactionLine;
  return sel(ctx);
}

/**
 * The refusal's line in the inhabitant's voice: `lineVoiceFrom` ('voice', or the older 'archetypeId')
 * keys the hook's lines bag by the parts' voiceId (sim/inhabitant voiceOf). Falls back to `default`.
 */
export function pickRefusalLine(hook: RefusalHook, player: Inhabitant, rng: Rng): string {
  const bag = hook.lines ?? {};
  const voiced = hook.lineVoiceFrom === 'voice' || hook.lineVoiceFrom === 'archetypeId';
  const lines = (voiced ? bag[voiceOf(player)] : undefined) ?? bag.default ?? [];
  if (!lines.length) return '';
  return lines[rng.int(0, lines.length)] ?? lines[0] ?? '';
}

export function findRefusal(
  state: MethodSimState,
  method: MethodRow,
  ctx: EffectCtx,
): RefusalHook | undefined {
  for (const hookId of state.player.hookIds) {
    const hook = state.data.hooksById.get(hookId) as RefusalHook | undefined;
    if (!hook || hook.kind !== 'refusal' || hook.trigger !== 'on_method_commit') continue;
    if (hook.methodId && hook.methodId !== method.id) continue;
    if (matchesWhen(hook.when, state, ctx)) return hook;
  }
  return undefined;
}
