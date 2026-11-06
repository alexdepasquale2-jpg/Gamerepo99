/**
 * Overworld asset manifest — maps Loom WorldRenderSnapshot keys → sheet/frame/variant.
 * Presentation only. Sim emits keys + heading degrees + warmth; never feel numbers.
 *
 * Grid: Loom LOCKED square ortho — q = x (column), r = y (row).
 * Doc: docs/art/OVERWORLD_ASSET_MAP.md
 */

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

/** Loom-locked square ortho grid. */
export const GRID = {
  kind: 'square_ortho' as const,
  /** Loom LOCKED: q = x (column), r = y (row). */
  qrToCell: (q: number, r: number): { x: number; y: number } => ({ x: q, y: r }),
  pendingLoomLock: false,
  note: 'Loom locked square ortho: q=x (column), r=y (row).',
};

/** Committed baked atlases under assets/sprites/ (fresh clone — no gitignored zips needed). */
export const BAKED_SHEETS = {
  ground: 'assets/sprites/sheet-ground.png',
  cliff: 'assets/sprites/sheet-cliff.png',
  buildings: 'assets/sprites/sheet-buildings.png',
  buildingsSide: 'assets/sprites/sheet-buildings-side.png',
  biomes: 'assets/sprites/sheet-biomes.png',
  fauna: 'assets/sprites/sheet-fauna.png',
  crops: 'assets/sprites/sheet-crops.png',
  ores: 'assets/sprites/sheet-ores.png',
} as const;

/**
 * Sprite anchor + depth-sort convention (Forge / Loom overworld).
 * Origin: bottom-center (0.5, 1) of the sprite frame.
 * sortY = world Y of the foot / contact point (same as the origin after placement).
 * Draw order: ascending sortY (lower on screen = later / in front).
 */
export const SPRITE_SORT = {
  originX: 0.5,
  originY: 1.0,
  note: 'bottom-center origin; sortY = foot/contact world y',
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

function entry(
  key: string,
  sheet: string,
  frame: number,
  rest: Partial<AssetEntry> = {},
): AssetEntry {
  return {
    key,
    sheet,
    frame,
    variant: rest.variant ?? 'palette',
    heading: rest.heading ?? 'none',
    status: rest.status ?? 'ready',
    ...rest,
  };
}

/** Canonical overworld key → entry. Aliases redirect via aliasOf. */
export const OVERWORLD_ASSETS: Record<string, AssetEntry> = {
  // —— Biomes (world/biomes.json) ——
  'biome.river_margin': entry('biome.river_margin', 'sheet-biomes', 0, {
    notes: 'Tiny Town grass/cobble + reed props; pastoral wet verge',
    despairHint: 'grey mud, still water',
    aliveHint: 'teal water, green reeds',
  }),
  'biome.ash_wood': entry('biome.ash_wood', 'sheet-biomes', 2, {
    notes: 'Tiny Town trees 15-16, 27-28',
    despairHint: 'bare canopy',
    aliveHint: 'full green',
  }),
  'biome.mill_heath': entry('biome.mill_heath', 'sheet-biomes', 4, {
    notes: 'open heath + autumn trees; pastoral grass',
    despairHint: 'dead scrub',
    aliveHint: 'golden heath, flowers',
  }),
  'biome.glare_approach': entry('biome.glare_approach', 'sheet-biomes', 6, {
    notes: 'dirt 39-42 + stone verge',
    despairHint: 'dust bleach',
    aliveHint: 'cobble verge',
  }),
  'biome.peat_fen': entry('biome.peat_fen', 'sheet-biomes', 8, {
    status: 'stub',
    notes: 'Imported pastoral-overworld db32; kit-biomes frame TBD',
    despairHint: 'brown peat, dead reed',
    aliveHint: 'wet moss, alive reed beds',
  }),
  'biome.chalk_downs': entry('biome.chalk_downs', 'sheet-biomes', 10, {
    status: 'stub',
    notes: 'Pastoral pale grass / chalk soil',
    despairHint: 'bleached chalk, sparse scrub',
    aliveHint: 'short green turf, wildflowers',
  }),
  'biome.brine_marsh': entry('biome.brine_marsh', 'sheet-biomes', 12, {
    status: 'stub',
    notes: 'Pastoral wet + Tiny Town water tiles',
    despairHint: 'salt crust, grey flats',
    aliveHint: 'tidal green, shimmering pools',
  }),
  'biome.slag_verge': entry('biome.slag_verge', 'sheet-biomes', 14, {
    status: 'stub',
    notes: 'Imported Kenney caves/dungeons rock + slag props',
    despairHint: 'ash slag, cold cinder',
    aliveHint: 'warm cinder, sparse green reclaim',
  }),

  // —— Roads ——
  'road.track': entry('road.track', 'sheet-ground', 4, { notes: '1 cell dirt' }),
  'road.road': entry('road.road', 'sheet-ground', 5, { notes: '2 cell dirt+cobble' }),
  'road.highway': entry('road.highway', 'sheet-ground', 6, { notes: '3 cell cobble' }),

  // —— Facilities (kinds × states) ——
  ...facilityBlock('mill', 'sheet-buildings', 0),
  ...facilityBlock('lumber_camp', 'sheet-buildings', 1),
  ...facilityBlock('waystation', 'sheet-buildings', 2),
  ...facilityBlock('mine', 'sheet-buildings', 3),

  // —— Ore (economy-resources mineral ids) ——
  'ore.ore_iron': entry('ore.ore_iron', 'sheet-ores', 0, {
    status: 'stub',
    notes: 'Imported Kenney Roguelike Caves & Dungeons — frame bake TBD',
  }),
  'ore.ore_copper': entry('ore.ore_copper', 'sheet-ores', 1, {
    status: 'stub',
    notes: 'Caves pack ore tint / DCSS supplemental copper',
  }),
  'ore.ore_slag_tin': entry('ore.ore_slag_tin', 'sheet-ores', 2, {
    status: 'stub',
    notes: 'Slag/tin from caves rock + ash tint',
  }),

  // —— Crops (economy/crops.json → crop.<id>) ——
  'crop.crop_wheat': entry('crop.crop_wheat', 'sheet-crops', 0, {
    status: 'stub',
    notes: 'Imported josehzz FarmingCrops16x16 — wheat stages',
    despairHint: 'wilted stalks',
    aliveHint: 'golden heads',
  }),
  'crop.crop_barley': entry('crop.crop_barley', 'sheet-crops', 1, {
    status: 'stub',
    notes: 'josehzz rice/corn stand-in until barley row mapped',
    despairHint: 'grey chaff',
    aliveHint: 'ripe barley',
  }),
  'crop.crop_root': entry('crop.crop_root', 'sheet-crops', 2, {
    status: 'stub',
    notes: 'josehzz potato/cassava',
    despairHint: 'shrivelled tops',
    aliveHint: 'leafy root mash',
  }),
  'crop.crop_reed': entry('crop.crop_reed', 'sheet-crops', 3, {
    status: 'stub',
    notes: 'No reed in josehzz — pastoral wet prop / Tiny Town reed until dedicated',
    despairHint: 'broken stems',
    aliveHint: 'tall green reed',
  }),
  'crop.crop_flax': entry('crop.crop_flax', 'sheet-crops', 4, {
    status: 'stub',
    notes: 'No flax in josehzz — sunflower/blue flower stand-in',
    despairHint: 'dry fibre',
    aliveHint: 'blue flax bloom',
  }),

  // —— Cargo (non-ore resources) ——
  'cargo.food_grain': entry('cargo.food_grain', 'josehzz-farming-crops', 0, {
    status: 'stub',
    notes: 'Resource pile; field art uses crop.* keys',
  }),
  'cargo.timber': entry('cargo.timber', 'kenney-tiny-town', 93, {
    status: 'ready',
    notes: 'Tiny Town log tile_0093',
  }),
  'cargo.wool': entry('cargo.wool', 'vendor-jetrel-items', 0, { status: 'stub' }),
  'cargo.fuel_cord': entry('cargo.fuel_cord', 'vendor-jetrel-items', 1, { status: 'stub' }),
  'cargo.coin': entry('cargo.coin', 'vendor-jetrel-items', 2, { status: 'stub' }),

  // —— Caravans (travel-trades roles) ——
  'caravan.carter': entry('caravan.carter', 'kenney-tiny-town', 57, {
    heading: '8',
    status: 'ready',
    notes: 'cart tile; walker overlay uses Tiny Dungeon',
  }),
  'caravan.caravaner': entry('caravan.caravaner', 'kenney-tiny-town', 57, {
    heading: '8',
    status: 'stub',
    notes: 'multi-cart wagon stub',
  }),
  'caravan.guild': entry('caravan.guild', 'kenney-tiny-town', 57, {
    status: 'alias',
    aliasOf: 'caravan.caravaner',
  }),
  'caravan.ferryman': entry('caravan.ferryman', 'vendor-roguelike-boat', 0, {
    heading: '4',
    status: 'missing',
    notes: 'Need Roguelike water/boat import',
  }),
  'caravan.ferry': entry('caravan.ferry', 'vendor-roguelike-boat', 0, {
    status: 'alias',
    aliasOf: 'caravan.ferryman',
  }),
  'caravan.mount': entry('caravan.mount', 'vendor-animals', 0, {
    heading: '8',
    status: 'missing',
    notes: 'CC0 animal pack (davidcrybao / critters)',
  }),
  'caravan.guide': entry('caravan.guide', 'kenney-tiny-dungeon', 100, {
    heading: '4',
    status: 'ready',
    frames: [100, 100, 100, 100],
    notes: 'Elder stub; replace with 8-way walk sheet',
  }),
  'caravan.courier': entry('caravan.courier', 'kenney-tiny-dungeon', 99, {
    heading: '4',
    status: 'ready',
  }),
  'caravan.smuggler': entry('caravan.smuggler', 'kenney-tiny-dungeon', 87, {
    heading: '4',
    status: 'ready',
    notes: 'Rogue recolor',
  }),
  'caravan.gouger': entry('caravan.gouger', 'kenney-tiny-dungeon', 96, {
    heading: '4',
    status: 'ready',
  }),
  'caravan.scammer': entry('caravan.scammer', 'kenney-tiny-dungeon', 99, {
    heading: '4',
    status: 'ready',
  }),
  'caravan.highwayman': entry('caravan.highwayman', 'kenney-tiny-dungeon', 96, {
    heading: '4',
    status: 'ready',
  }),
  'caravan.worker': entry('caravan.worker', 'kenney-tiny-dungeon', 100, {
    heading: '4',
    status: 'ready',
  }),
  'caravan.traveler': entry('caravan.traveler', 'kenney-tiny-dungeon', 99, {
    heading: '4',
    status: 'ready',
  }),

  // —— Fauna (world/fauna.json) — sheets imported; frame indices stub ——
  'fauna.rabbit': entry('fauna.rabbit', 'sheet-fauna', 0, {
    heading: '4',
    status: 'stub',
    notes: 'Imported gaymoo 50 monochrome 32×32; recolor for warmth',
  }),
  'fauna.deer': entry('fauna.deer', 'sheet-fauna', 1, {
    heading: '4',
    status: 'stub',
    notes: 'Imported AndHeGames more-creatures-32',
  }),
  'fauna.bird': entry('fauna.bird', 'sheet-fauna', 2, {
    heading: '4',
    status: 'stub',
    notes: 'Imported davidcrybao all-sheet',
  }),
  'fauna.pig': entry('fauna.pig', 'sheet-fauna', 3, {
    heading: '4',
    status: 'stub',
    notes: 'Imported Pig_Look 32×32 anim sheet',
  }),
  'fauna.fox': entry('fauna.fox', 'sheet-fauna', 4, {
    heading: '4',
    status: 'stub',
    notes: 'AndHeGames / gaymoo recolor',
  }),
  'fauna.fish': entry('fauna.fish', 'sheet-fauna', 5, {
    heading: '4',
    status: 'stub',
    notes: 'davidcrybao water critters',
  }),
  'fauna.heron': entry('fauna.heron', 'sheet-fauna', 6, {
    heading: '4',
    status: 'stub',
    notes: 'davidcrybao tall wader stand-in; dedicated heron TBD',
  }),
  'fauna.rat': entry('fauna.rat', 'sheet-fauna', 7, {
    heading: '4',
    status: 'stub',
    notes: 'gaymoo / sardonic grey-roguelike rat',
  }),
};

/** Proposed facility kinds — NOT in facilities.json (do not list as data gaps). */
export const PROPOSED_FACILITY_KINDS = {
  farm: {
    states: ['idle', 'working', 'abandoned'] as const,
    sheet: 'josehzz-farming-crops',
    notes:
      'Not a facilities.json kind. Field stamps use crop.<id>; cargo uses food_grain / wool / timber.',
  },
} as const;

function facilityBlock(
  kind: string,
  sheet: string,
  col: number,
  forceStatus?: AssetStatus,
): Record<string, AssetEntry> {
  const states = ['idle', 'working', 'abandoned'] as const;
  const out: Record<string, AssetEntry> = {};
  states.forEach((state, i) => {
    const key = `facility.${kind}.${state}`;
    out[key] = entry(key, sheet, col * 3 + i, {
      variant: state === 'abandoned' ? 'swap' : 'palette',
      status: forceStatus ?? 'ready',
      notes:
        forceStatus === 'missing'
          ? 'kind not in facilities.json — reserved'
          : state === 'working'
            ? 'lit windows + render smoke'
            : state === 'abandoned'
              ? 'broken overlay + warmth floor'
              : 'cold panes',
    });
  });
  return out;
}

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
export const DATA_BIOME_IDS = [
  'river_margin',
  'ash_wood',
  'mill_heath',
  'glare_approach',
  'peat_fen',
  'chalk_downs',
  'brine_marsh',
  'slag_verge',
] as const;

/** Facility kinds present in facilities.json */
export const DATA_FACILITY_KINDS = ['mill', 'lumber_camp', 'waystation', 'mine'] as const;

/** Travel-trade roles */
export const DATA_CARAVAN_ROLES = [
  'carter',
  'caravaner',
  'ferryman',
  'mount',
  'guide',
  'courier',
  'smuggler',
  'gouger',
  'scammer',
  'highwayman',
] as const;

/** Mineral resource ids for ore.* */
export const DATA_ORE_IDS = ['ore_iron', 'ore_copper', 'ore_slag_tin'] as const;

/** Fauna ids from world/fauna.json */
export const DATA_FAUNA_IDS = [
  'rabbit',
  'deer',
  'bird',
  'pig',
  'fox',
  'fish',
  'heron',
  'rat',
] as const;

/** Crop ids from economy/crops.json */
export const DATA_CROP_IDS = [
  'crop_wheat',
  'crop_barley',
  'crop_root',
  'crop_reed',
  'crop_flax',
] as const;

/** Economy resource ids (cargo / ore mapping). */
export const DATA_RESOURCE_IDS = [
  'food_grain',
  'timber',
  'ore_iron',
  'wool',
  'fuel_cord',
  'coin',
  'ore_copper',
  'ore_slag_tin',
] as const;
