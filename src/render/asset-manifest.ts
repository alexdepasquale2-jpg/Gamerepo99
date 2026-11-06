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

/** Square ortho bridge until Loom locks hex. */
export const GRID = {
  kind: 'square_ortho' as const,
  /** Loom LOCKED: q = x (column), r = y (row). */
  qrToCell: (q: number, r: number): { x: number; y: number } => ({ x: q, y: r }),
  pendingLoomLock: false,
  note: 'Loom locked square ortho: q=x (column), r=y (row).',
};

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
  // —— Biomes (biomes.json) ——
  'biome.river_margin': entry('biome.river_margin', 'kit-biomes', 0, {
    notes: 'Tiny Town grass/cobble + reed props',
    despairHint: 'grey mud, still water',
    aliveHint: 'teal water, green reeds',
  }),
  'biome.ash_wood': entry('biome.ash_wood', 'kit-biomes', 1, {
    notes: 'Tiny Town trees 15-16, 27-28',
    despairHint: 'bare canopy',
    aliveHint: 'full green',
  }),
  'biome.mill_heath': entry('biome.mill_heath', 'kit-biomes', 2, {
    notes: 'open heath + autumn trees',
    despairHint: 'dead scrub',
    aliveHint: 'golden heath, flowers',
  }),
  'biome.glare_approach': entry('biome.glare_approach', 'kit-biomes', 3, {
    notes: 'dirt 39-42 + stone verge',
    despairHint: 'dust bleach',
    aliveHint: 'cobble verge',
  }),

  // —— Roads ——
  'road.track': entry('road.track', 'kit-roads', 0, { notes: '1 cell dirt' }),
  'road.road': entry('road.road', 'kit-roads', 1, { notes: '2 cell dirt+cobble' }),
  'road.highway': entry('road.highway', 'kit-roads', 2, { notes: '3 cell cobble' }),

  // —— Facilities (kinds × states) ——
  ...facilityBlock('mill', 'kit-facilities', 0),
  ...facilityBlock('lumber_camp', 'kit-facilities', 1),
  ...facilityBlock('waystation', 'kit-facilities', 2),
  ...facilityBlock('mine', 'kit-facilities', 3),

  // —— Ore / cargo ——
  'ore.ore_iron': entry('ore.ore_iron', 'vendor-caves-ore', 0, {
    status: 'stub',
    notes: 'Import Kenney Caves & Dungeons / Jetrel / DCSS',
  }),
  'cargo.food_grain': entry('cargo.food_grain', 'vendor-crops', 0, {
    status: 'stub',
    notes: 'Crop visuals map here (no separate crop ids). CC0: josehzz Farming crops 16x16.',
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

  // —— Fauna placeholders (no fauna ids in src/data) ——
  'fauna.rabbit': entry('fauna.rabbit', 'vendor-grey-roguelike', 0, {
    heading: '4',
    status: 'placeholder',
    notes: 'Placeholder until Loom adds fauna table',
  }),
  'fauna.deer': entry('fauna.deer', 'vendor-andhegames', 0, {
    heading: '4',
    status: 'placeholder',
  }),
  'fauna.bird': entry('fauna.bird', 'vendor-davidcrybao', 0, {
    heading: '4',
    status: 'placeholder',
  }),
  'fauna.pig': entry('fauna.pig', 'vendor-pig-look', 0, {
    heading: '4',
    status: 'placeholder',
  }),
  'fauna.fox': entry('fauna.fox', 'vendor-andhegames', 1, {
    heading: '4',
    status: 'placeholder',
  }),
  'fauna.fish': entry('fauna.fish', 'vendor-davidcrybao', 1, {
    heading: '4',
    status: 'placeholder',
  }),
};

/** Proposed facility kinds — NOT in facilities.json (do not list as data gaps). */
export const PROPOSED_FACILITY_KINDS = {
  farm: {
    states: ['idle', 'working', 'abandoned'] as const,
    sheet: 'vendor-josehzz-crops',
    notes:
      'Not a data type. Crop art maps to resource/cargo food_grain. CC0: josehzz Farming crops 16x16.',
    cropResourceId: 'food_grain' as const,
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

/** Loom-final biome ids (biomes.json canonical set for M3 handoff). */
export const DATA_BIOME_IDS = ['river_margin', 'ash_wood', 'mill_heath', 'glare_approach'] as const;

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
export const DATA_ORE_IDS = ['ore_iron'] as const;

/** All economy-resources.json ids Loom locked for cargo/ore mapping. */
export const DATA_RESOURCE_IDS = ['food_grain', 'timber', 'ore_iron', 'wool', 'fuel_cord', 'coin'] as const;
