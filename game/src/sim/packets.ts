/** Cross-town packet emit/deliver along Fabric kin edges. Pure; no Phaser/DOM. */

import { chronicleJuice } from './chronicle';
import type { DataTables } from './load-data';
import type { PacketState, PersonState, SimState } from './types/runtime';

export type KinEdgeRef = { from: string; to: string; kind?: string };

type CrossTownCfg = {
  onGenuineGrowthChance?: number;
  onHollownessChance?: number;
  emitPacketType?: string;
  emitPressureType?: string;
};

type RipplesCfg = { crossTown?: CrossTownCfg };

type RouteRef = { fromId: string; toId: string; days: number };

type PacketSim = SimState & {
  kinEdges?: KinEdgeRef[];
  routes?: RouteRef[];
};

export function pushJuice(state: SimState, eventId: string, payload?: unknown): void {
  const bus = (state.bus ??= { lastIds: [] }) as {
    lastIds?: string[];
    emit?: (e: string, p: unknown) => void;
  };
  (bus.lastIds ??= []).push(eventId);
  chronicleJuice(state, eventId, payload);
  bus.emit?.(eventId, payload);
}

function otherEnd(edge: KinEdgeRef, personId: string): string | null {
  if (edge.from === personId) return edge.to;
  if (edge.to === personId) return edge.from;
  return null;
}

function routeDays(state: PacketSim, fromTown: string, toTown: string): number {
  for (const r of state.routes ?? []) {
    if (
      (r.fromId === fromTown && r.toId === toTown) ||
      (r.fromId === toTown && r.toId === fromTown)
    ) {
      return Math.max(1, r.days);
    }
  }
  return 2;
}

function crossTownEnabled(ripples: RipplesCfg | undefined, markId: string): boolean {
  const ct = ripples?.crossTown;
  if (!ct) return false;
  if (markId === 'genuine_growth') return (ct.onGenuineGrowthChance ?? 0) > 0;
  if (markId === 'hollowness') return (ct.onHollownessChance ?? 0) > 0;
  return false;
}

function packetKind(ripples: RipplesCfg | undefined, markId: string): string {
  const ct = ripples?.crossTown;
  if (markId === 'hollowness') return ct?.emitPressureType ?? 'relapse_pressure';
  return ct?.emitPacketType ?? 'proof_packet';
}

/** Pick a kin neighbor in a different town (Fabric edges, not Ashford-only links). */
export function findCrossTownKin(
  state: PacketSim,
  personId: string,
): { edge: KinEdgeRef; otherId: string; other: PersonState } | null {
  const self = state.people[personId];
  if (!self?.townId) return null;
  for (const edge of state.kinEdges ?? []) {
    const oid = otherEnd(edge, personId);
    if (!oid) continue;
    const other = state.people[oid];
    if (!other?.townId || other.townId === self.townId) continue;
    return { edge, otherId: oid, other };
  }
  return null;
}

/**
 * After genuine_growth / hollowness, emit a packet along a cross-town kin edge.
 * Chance fields in ripples.json act as enable flags (>0) for deterministic M3 play.
 */
export function maybeEmitCrossTownPacket(state: SimState, personId: string, markId: string): boolean {
  const s = state as PacketSim;
  const ripples = (s.data as DataTables | undefined)?.ripples as RipplesCfg | undefined;
  if (!crossTownEnabled(ripples, markId)) return false;
  const hit = findCrossTownKin(s, personId);
  if (!hit) return false;
  const self = s.people[personId]!;
  const days = routeDays(s, self.townId!, hit.other.townId!);
  const packet: PacketState = {
    id: `pkt_${personId}_${hit.otherId}_${s.day}`,
    days,
    kind: packetKind(ripples, markId),
    fromTownId: self.townId,
    toTownId: hit.other.townId,
  };
  s.packets.push(packet);
  pushJuice(s, 'packet.emit', {
    packetId: packet.id,
    fromPersonId: personId,
    toPersonId: hit.otherId,
    kind: packet.kind,
    days,
  });
  return true;
}

/** Dawn/tick: decrement in-flight packets; deliver when days elapse. */
export function tickPackets(state: SimState): string[] {
  const delivered: string[] = [];
  const next: PacketState[] = [];
  for (const p of state.packets) {
    const days = p.days - 1;
    if (days > 0) {
      next.push({ ...p, days });
      continue;
    }
    delivered.push(p.id);
    pushJuice(state, 'packet.deliver', {
      packetId: p.id,
      kind: p.kind,
      fromTownId: p.fromTownId,
      toTownId: p.toTownId,
    });
    const proofs = (state.deliveredProofs ??= []);
    proofs.push({ packetId: p.id, kind: p.kind, toTownId: p.toTownId, day: state.day });
    if (proofs.length > PROOFS_KEPT) proofs.splice(0, proofs.length - PROOFS_KEPT);
    landPacket(state, p);
  }
  state.packets = next;
  return delivered;
}

/** How many delivered packets the save keeps (newest last). */
const PROOFS_KEPT = 24;
/** What a packet does when it lands: word of someone's change reaches kin in another town. */
const LAND = { proofFlame: 4, proofTrust: 0.03, proofDespair: -0.01, relapseFlame: -3, relapseDespair: 0.01 };

/**
 * A proof (someone rekindled) lifts one struggling person there and eases the town a little; a relapse
 * (someone hollowed) dims one burning person and weighs on the town. The person is picked by packet id.
 */
function landPacket(state: SimState, p: PacketState): void {
  if (!p.toTownId) return;
  const burnAt = (state.data as DataTables | undefined)?.reigniteThreshold ?? 35;
  const proof = p.kind !== 'relapse_pressure';
  const folk = Object.values(state.people)
    .filter((x) => x.townId === p.toTownId && !x.tags?.includes('retired') && (proof ? x.flame < burnAt : x.flame >= burnAt))
    .sort((a, b) => a.id.localeCompare(b.id));
  const who = folk.length ? folk[hashIdx(p.id, folk.length)] : undefined;
  if (who) {
    who.flame = Math.max(0, Math.min(100, who.flame + (proof ? LAND.proofFlame : LAND.relapseFlame)));
    if (proof) who.trust = Math.min(1, (who.trust ?? 0.5) + LAND.proofTrust);
  }
  const town = (state as SimState & { towns?: Record<string, { despair: number }> }).towns?.[p.toTownId];
  if (town) town.despair = Math.min(1, Math.max(0, town.despair + (proof ? LAND.proofDespair : LAND.relapseDespair)));
  if (who) pushJuice(state, proof ? 'packet.lifted' : 'packet.dimmed', { townId: p.toTownId, personId: who.id, kind: p.kind });
}

function hashIdx(id: string, n: number): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) % n;
}
