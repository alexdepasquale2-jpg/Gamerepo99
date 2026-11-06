/**
 * Overworld asset manifest — maps Loom WorldRenderSnapshot keys → sheet/frame/variant.
 * Presentation only. Data lives in assets/manifest/overworld-assets.json.
 *
 * Grid: Loom LOCKED square ortho — q = x (column), r = y (row).
 * Doc: docs/art/OVERWORLD_ASSET_MAP.md
 */

import manifestJson from '../../assets/manifest/overworld-assets.json';

export type AssetStatus = 'ready' | 'stub' | 'missing' | 'alias' | 'placeholder' | 'proposed';
export type AssetVariant = 'palette' | 'swap' | 'none';
export type HeadingMode = '8' | '4' | 'none';

export type AssetEntry = {
  key: string;
  /** Logical sheet / atlas id (kit sheet or vendor pack id) */
  sheet: string;
  /** Default frame index or Tiny Town tile index when known */
  frame: number;
  /** Extra frames for heading (length 4 or 8) or state overlays */
  frames?: number[];
  variant: AssetVariant;
  heading: HeadingMode;
  status: AssetStatus;
  /** If alias, points at canonical key */
  aliasOf?: string;
  notes?: string;
  despairHint?: string;
  aliveHint?: string;
};

type ManifestDoc = {
  grid: { kind: string; pendingLoomLock: boolean; note?: string };
  spriteSort: { originX: number; originY: number; note?: string };
  bakedSheets: Record<string, string>;
  dataIds: {
    biomes: string[];
    facilities: string[];
    resources: string[];
    ores: string[];
    fauna: string[];
    crops: string[];
    caravanRoles: string[];
  };
  proposed: Record<
    string,
    { states: readonly string[]; sheet: string; notes: string }
  >;
  assets: Record<string, AssetEntry>;
};

const doc = manifestJson as ManifestDoc;

/** Loom-locked square ortho grid. */
export const GRID = {
  kind: 'square_ortho' as const,
  /** Loom LOCKED: q = x (column), r = y (row). */
  qrToCell: (q: number, r: number): { x: number; y: number } => ({ x: q, y: r }),
  pendingLoomLock: doc.grid.pendingLoomLock,
  note: doc.grid.note ?? 'Loom locked square ortho: q=x (column), r=y (row).',
};

/** Committed baked atlases under assets/sprites/ (fresh clone — no gitignored zips needed). */
export const BAKED_SHEETS = {
  ground: doc.bakedSheets.ground,
  cliff: doc.bakedSheets.cliff,
  buildings: doc.bakedSheets.buildings,
  buildingsSide: doc.bakedSheets.buildingsSide,
  biomes: doc.bakedSheets.biomes,
  fauna: doc.bakedSheets.fauna,
  crops: doc.bakedSheets.crops,
  ores: doc.bakedSheets.ores,
} as const;

/**
 * Sprite anchor + depth-sort convention (Forge / Loom overworld).
 * Origin: bottom-center (0.5, 1) of the sprite frame.
 * sortY = world Y of the foot / contact point (same as the origin after placement).
 * Draw order: ascending sortY (lower on screen = later / in front).
 */
export const SPRITE_SORT = {
  originX: doc.spriteSort.originX,
  originY: doc.spriteSort.originY,
  note: doc.spriteSort.note ?? 'bottom-center origin; sortY = foot/contact world y',
} as const;

/**
 * Degrees clockwise from north → 8-way frame index.
 * Order: N, NE, E, SE, S, SW, W, NW
 */
export function headingToFrame8(headingDeg: number): number {
  const n = ((Math.round(headingDeg / 45) % 8) + 8) % 8;
  return n;
}

/**
 * Degrees clockwise from north → 4-way frame index.
 * Order: N, E, S, W
 */
export function headingToFrame4(headingDeg: number): number {
  const n = ((Math.round(headingDeg / 90) % 4) + 4) % 4;
  return n;
}

export function resolveHeadingFrame(entry: AssetEntry, headingDeg: number): number {
  if (entry.heading === '8' && entry.frames && entry.frames.length >= 8) {
    return entry.frames[headingToFrame8(headingDeg)]!;
  }
  if (entry.heading === '4' && entry.frames && entry.frames.length >= 4) {
    return entry.frames[headingToFrame4(headingDeg)]!;
  }
  if (entry.heading === '8') return headingToFrame8(headingDeg);
  if (entry.heading === '4') return headingToFrame4(headingDeg);
  return entry.frame;
}

/** Canonical overworld key → entry. Aliases redirect via aliasOf. */
export const OVERWORLD_ASSETS: Record<string, AssetEntry> = doc.assets;

/** Proposed facility kinds — NOT in facilities.json (do not list as data gaps). */
export const PROPOSED_FACILITY_KINDS = {
  farm: {
    states: (doc.proposed.farm?.states ?? ['idle', 'working', 'abandoned']) as readonly (
      | 'idle'
      | 'working'
      | 'abandoned'
    )[],
    sheet: doc.proposed.farm?.sheet ?? 'josehzz-farming-crops',
    notes:
      doc.proposed.farm?.notes ??
      'Not a facilities.json kind. Field stamps use crop.<id>; cargo uses food_grain / wool / timber.',
  },
} as const;

/** Resolve aliases to canonical entries. */
export function lookupAsset(key: string): AssetEntry | undefined {
  const e = OVERWORLD_ASSETS[key];
  if (!e) return undefined;
  if (e.status === 'alias' && e.aliasOf) return OVERWORLD_ASSETS[e.aliasOf] ?? e;
  return e;
}

export function listMissingKeys(): string[] {
  return Object.values(OVERWORLD_ASSETS)
    .filter((e) => e.status === 'missing')
    .map((e) => e.key)
    .sort();
}

export function listPlaceholderKeys(): string[] {
  return Object.values(OVERWORLD_ASSETS)
    .filter((e) => e.status === 'placeholder')
    .map((e) => e.key)
    .sort();
}

export function listStubKeys(): string[] {
  return Object.values(OVERWORLD_ASSETS)
    .filter((e) => e.status === 'stub')
    .map((e) => e.key)
    .sort();
}

/** Biome ids from world/biomes.json (fallback list if file absent). */
export const DATA_BIOME_IDS = doc.dataIds.biomes as readonly string[];

/** Facility kinds present in facilities.json */
export const DATA_FACILITY_KINDS = doc.dataIds.facilities as readonly string[];

/** Travel-trade roles */
export const DATA_CARAVAN_ROLES = doc.dataIds.caravanRoles as readonly string[];

/** Mineral resource ids for ore.* */
export const DATA_ORE_IDS = doc.dataIds.ores as readonly string[];

/** Fauna ids from world/fauna.json */
export const DATA_FAUNA_IDS = doc.dataIds.fauna as readonly string[];

/** Crop ids from economy/crops.json */
export const DATA_CROP_IDS = doc.dataIds.crops as readonly string[];

/** Economy resource ids (cargo / ore mapping). */
export const DATA_RESOURCE_IDS = doc.dataIds.resources as readonly string[];
