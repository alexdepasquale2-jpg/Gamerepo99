/** Headless Fabric world dump + inspect session for Probe. Pure; no Phaser/DOM. */

import { generateWorld } from './gen/world';
import type { FabricWorld } from './gen/world';

export type WorldDump = {
  text: string;
  hash: string;
};

export type InspectSnapshot = {
  seed: number;
  fingerprint: string;
  hash: string;
  townCount: number;
  siteIds: string[];
  peopleCount: number;
  historyCount: number;
  kinCount: number;
};

export type InspectSession = {
  dump(): string;
  snapshot(): InspectSnapshot;
};

export type CreatePlaySessionOpts = {
  mode: 'inspect';
  seed: number;
  peopleCount?: number;
};

/** FNV-1a 32-bit over UTF-16 code units — stable, free, no crypto dep. */
function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `wd-${h.toString(16).padStart(8, '0')}`;
}

/**
 * Byte-stable textual dump of a FabricWorld for Probe / QA.
 * Uses Task E shapes (gapSites as settlement sites — no invented Ashford towns).
 */
export function dumpWorld(world: FabricWorld): WorldDump {
  const lines: string[] = [];
  lines.push(`seed:${world.seed}`);
  lines.push(`fingerprint:${world.fingerprint}`);

  const sites = world.gapSites ?? [];
  lines.push(`townCount:${sites.length}`);
  for (const site of sites) {
    lines.push(`site:${site.id} gap01=${site.gap01}`);
  }

  const settlements = world.settlements ?? [];
  lines.push(`settlementCount:${settlements.length}`);
  for (const s of settlements) {
    lines.push(`settlement:${s.id} gap01=${s.gap01}`);
  }

  const history = world.history ?? [];
  lines.push(`historyCount:${history.length}`);
  for (const h of history) {
    const tags = (h.tags ?? []).join(',');
    const at = h.at ?? 0;
    lines.push(`history:${h.id} at=${at} tags=${tags}`);
  }

  lines.push(`peopleCount:${world.people.length}`);
  for (const p of world.people) {
    lines.push(`person:${p.id} fp=${p.fingerprint}`);
  }

  const kin = world.kinEdges ?? [];
  lines.push(`kinCount:${kin.length}`);
  for (const e of kin) {
    lines.push(`kin:${e.kind ?? 'kin'}:${e.from}->${e.to}`);
  }

  const facilities = world.facilities ?? [];
  lines.push(`facilityCount:${facilities.length}`);
  for (const f of facilities) {
    lines.push(`facility:${f.id}`);
  }

  const biomes = world.biomes ?? [];
  lines.push(`biomeCount:${biomes.length}`);
  for (const b of biomes) {
    lines.push(`biome:${b.id}`);
  }

  const text = lines.join('\n');
  return { text, hash: hashText(text) };
}

/**
 * Headless play/inspect session. M2 only supports mode: 'inspect'.
 * Probe calls dump()/snapshot() without Phaser.
 */
export function createPlaySession(
  opts?: CreatePlaySessionOpts,
): InspectSession | null {
  // No-arg / wrong-mode: return null so Probe feature-detect can try other factories.
  if (!opts || opts.mode !== 'inspect') {
    return null;
  }
  const world = generateWorld({
    seed: opts.seed,
    peopleCount: opts.peopleCount,
  });
  const dumped = dumpWorld(world);

  return {
    dump: () => dumped.text,
    snapshot: (): InspectSnapshot => ({
      seed: world.seed,
      fingerprint: world.fingerprint,
      hash: dumped.hash,
      townCount: world.gapSites?.length ?? 0,
      siteIds: (world.gapSites ?? []).map((s) => s.id),
      peopleCount: world.people.length,
      historyCount: world.history?.length ?? 0,
      kinCount: world.kinEdges?.length ?? 0,
    }),
  };
}
