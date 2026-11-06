/** Shared effect schema applicator. Pure: no Phaser/DOM/Math.random. */

import type { Effect, EffectOp } from './types/data';
import type { PacketState, SimState } from './types/runtime';
import type { DataTables } from './load-data';
import type { Rng } from './rng';

export type EffectCtx = {
  data: DataTables;
  rng: Rng;
  methodId?: string;
  methodTags?: string[];
  targetId?: string;
  targetTags?: string[];
  targetAge?: number;
  townDespair?: number;
  playerTraitTags?: string[];
  successor?: { sparkStart?: number };
  town?: Record<string, number>;
};

type MutableEffect = Effect & {
  value?: number | string;
  packetType?: string;
  vitalityDelta?: number;
  scope?: string;
  scaleBy?: string;
};

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getPath(state: SimState, ctx: EffectCtx, target: string): unknown {
  switch (target) {
    case 'player.spark':
      return state.player.spark;
    case 'player.perception.trust': {
      const p = (state.player.perception ??= {});
      return p.trust ?? 0;
    }
    case 'player.statusTrait':
      return state.player.statusTraits;
    case 'successor.sparkStart':
      return ctx.successor?.sparkStart ?? 0;
    case 'town.fear':
    case 'town.trust':
    case 'town.despair':
    case 'town.vitality': {
      const key = target.slice('town.'.length);
      const town = (ctx.town ??= {});
      return town[key] ?? 0;
    }
    case 'link.packet':
      return state.packets;
    default:
      return undefined;
  }
}

function setPath(state: SimState, ctx: EffectCtx, target: string, next: unknown): void {
  switch (target) {
    case 'player.spark':
      state.player.spark = asNumber(next);
      break;
    case 'player.perception.trust': {
      const p = (state.player.perception ??= {});
      p.trust = asNumber(next);
      break;
    }
    case 'player.statusTrait': {
      const id = String(next);
      if (!state.player.statusTraits.includes(id)) state.player.statusTraits.push(id);
      break;
    }
    case 'successor.sparkStart': {
      const s = (ctx.successor ??= {});
      s.sparkStart = asNumber(next);
      break;
    }
    case 'town.fear':
    case 'town.trust':
    case 'town.despair':
    case 'town.vitality': {
      const key = target.slice('town.'.length);
      const town = (ctx.town ??= {});
      town[key] = asNumber(next);
      break;
    }
    default:
      break;
  }
}

function applyNumeric(op: EffectOp, current: number, value: number): number {
  if (op === 'add') return current + value;
  if (op === 'mul') return current * value;
  if (op === 'set') return value;
  return current;
}

function emitPacket(state: SimState, effect: MutableEffect): void {
  const packet: PacketState = {
    id: effect.packetId ?? effect.packetType ?? effect.id,
    days: asNumber(effect.value, 1),
    kind: effect.packetType ?? effect.packetId ?? 'packet',
  };
  state.packets.push(packet);
}

function grantMark(state: SimState, ctx: EffectCtx, effect: MutableEffect): void {
  const personId = ctx.targetId;
  if (!personId) return;
  const person = state.people[personId];
  if (!person) return;
  const markId = effect.markId ?? String(effect.value ?? '');
  if (!markId) return;
  const marks = (person.marks ??= []);
  const existing = marks.find((m) => m.markId === markId);
  if (existing) existing.stacks += 1;
  else marks.push({ markId, stacks: 1 });
}

function removeMark(state: SimState, ctx: EffectCtx, effect: MutableEffect): void {
  const personId = ctx.targetId;
  if (!personId) return;
  const person = state.people[personId];
  if (!person?.marks) return;
  const markId = effect.markId ?? String(effect.value ?? '');
  person.marks = person.marks.filter((m) => m.markId !== markId);
}

/** Apply one effect onto mutable sim state. */
export function applyEffect(state: SimState, effect: Effect, ctx: EffectCtx): void {
  const fx = effect as MutableEffect;
  const op = fx.op;

  if (op === 'emit_packet') {
    emitPacket(state, fx);
    return;
  }
  if (op === 'grant_mark') {
    grantMark(state, ctx, fx);
    return;
  }
  if (op === 'remove_mark') {
    removeMark(state, ctx, fx);
    return;
  }

  if (fx.target === 'player.statusTrait' && op === 'set') {
    setPath(state, ctx, fx.target, fx.value);
    return;
  }

  const current = asNumber(getPath(state, ctx, fx.target), 0);
  const value = asNumber(fx.value, 0);
  setPath(state, ctx, fx.target, applyNumeric(op, current, value));
}
