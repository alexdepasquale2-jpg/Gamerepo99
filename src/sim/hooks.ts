/** Generic hook runner: trigger + when{} → effects. No archetypeId branches. */

import type { HookDef, HookWhen } from './types/data';
import type { SimState } from './types/runtime';
import { applyEffect, type EffectCtx } from './effects';

export type HookCtx = EffectCtx;

function flagEq(state: SimState, key: string, expected: unknown): boolean {
  if (typeof expected === 'boolean') return Boolean(state.flags[key]) === expected;
  return state.flags[key] === expected;
}

function matchClause(
  key: string,
  expected: unknown,
  state: SimState,
  ctx: HookCtx,
): boolean {
  switch (key) {
    case 'any': {
      const alts = Array.isArray(expected) ? (expected as HookWhen[]) : [];
      return alts.some((alt) => matchesWhen(alt, state, ctx));
    }
    case 'playerHasStatusTrait':
    case 'statusTraitId':
      return state.player.statusTraits.includes(String(expected));
    case 'methodId':
      return ctx.methodId === expected;
    case 'methodsUsedYesterdayNotContains': {
      const used = (state.flags.methodsUsedYesterday as string[] | undefined) ?? [];
      const banned = Array.isArray(expected) ? (expected as string[]) : [];
      return banned.every((m) => !used.includes(m));
    }
    case 'methodTagsContain': {
      const tags = ctx.methodTags ?? [];
      const need = Array.isArray(expected) ? (expected as string[]) : [];
      return need.every((t) => tags.includes(t));
    }
    case 'targetHasTag':
      return (ctx.targetTags ?? []).includes(String(expected));
    case 'targetAgeLt':
      return (ctx.targetAge ?? Number.POSITIVE_INFINITY) < Number(expected);
    case 'targetIdIn': {
      const ids = Array.isArray(expected) ? (expected as string[]) : [];
      return ids.includes(String(ctx.targetId ?? ''));
    }
    case 'requireTraitTag': {
      const tags = ctx.playerTraitTags ?? state.player.statusTraits;
      return tags.includes(String(expected));
    }
    case 'townDespairAbove': {
      const despair = Number(ctx.townDespair ?? state.flags.townDespair ?? 0);
      return despair > Number(expected);
    }
    case 'standUpPeopleInTownAtLeast': {
      const byTown = (state.flags.standUpByTown ?? {}) as Record<string, string[]>;
      return Object.values(byTown).some((ids) => new Set(ids).size >= Number(expected));
    }
    default:
      if (Object.prototype.hasOwnProperty.call(state.flags, key) || typeof expected === 'boolean') {
        return flagEq(state, key, expected);
      }
      if (key in ctx) return (ctx as Record<string, unknown>)[key] === expected;
      return flagEq(state, key, expected);
  }
}

export function matchesWhen(
  when: HookWhen | undefined,
  state: SimState,
  ctx: HookCtx,
): boolean {
  if (!when) return true;
  const entries = Object.entries(when);
  if (entries.length === 0) return true;
  for (const [key, expected] of entries) {
    if (!matchClause(key, expected, state, ctx)) return false;
  }
  return true;
}

function resolveHook(state: SimState, hookId: string, ctx: HookCtx): HookDef | undefined {
  return ctx.data.hooksById.get(hookId);
}

/** Run all player hooks whose trigger matches and when{} passes. */
export function runHooks(state: SimState, trigger: string, ctx: HookCtx): void {
  const universal = [...ctx.data.hooksById.values()].filter((h) => h.universal).map((h) => h.id);
  for (const hookId of new Set([...state.player.hookIds, ...universal])) {
    const hook = resolveHook(state, hookId, ctx);
    if (!hook) continue;
    if (hook.trigger !== trigger) continue;
    if (!matchesWhen(hook.when, state, ctx)) continue;
    for (const effect of hook.effects ?? []) {
      applyEffect(state, effect, ctx);
    }
  }
}
