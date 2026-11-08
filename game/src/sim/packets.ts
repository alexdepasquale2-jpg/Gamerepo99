/** Cross-town packet emit/deliver along Fabric kin edges. Pure; no Phaser/DOM. */

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
    (state.deliveredProofs ??= []).push({
      packetId: p.id,
      kind: p.kind,
      toTownId: p.toTownId,
    });
  }
  state.packets = next;
  return delivered;
}
