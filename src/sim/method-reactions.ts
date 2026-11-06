/** Refusal hooks + reaction-line selection. Pure sim; no module-level mutable selector. */

import { matchesWhen } from './hooks';
import type { DataTables } from './load-data';
import type { Rng } from './rng';
import type { EffectCtx } from './effects';
import type { HookDef } from './types/data';
import type { SimState } from './types/runtime';

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
};
export type ReactionLineResult = {
  lineId: string;
  text: string;
  source: 'fixed' | 'blend' | 'fallback';
};
export type ReactionLineSelector = (ctx: ReactionPickCtx) => ReactionLineResult;

export function pickFixedReactionLine(ctx: ReactionPickCtx): ReactionLineResult {
  const people = (ctx.state.data.lines as { people?: Record<string, { methods?: Record<string, string> }> })
    .people;
  const text = people?.[ctx.personId]?.methods?.[ctx.methodId] ?? '';
  return { lineId: `${ctx.personId}.${ctx.methodId}`, text, source: text ? 'fixed' : 'fallback' };
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

export function pickRefusalLine(hook: RefusalHook, archetypeId: string, rng: Rng): string {
  const bag = hook.lines ?? {};
  const lines = (hook.lineVoiceFrom === 'archetypeId' ? bag[archetypeId] : undefined) ?? bag.default ?? [];
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
