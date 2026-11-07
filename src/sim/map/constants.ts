/** Map layout + stamp raster defaults (pure; no Phaser). */

/** Linear world scale: 40x the area of the original map (sqrt 40). */
export const WORLD_SCALE = 6.32;

export const CHUNK_SIZE = 32;
export const TILE_PX = 32;
/** ~2 tiles/sec walk → tiles covered per in-game minute. */
export const TILES_PER_MINUTE = 120;
/** Minutes between spine-neighbor settlements. */
export const WALK_MINUTES_SPINE = 3;

/** Tile spacing between consecutive spine settlements. */
export const SPINE_SPACING = WALK_MINUTES_SPINE * TILES_PER_MINUTE;

/** Max |perpendicular| jitter in tiles (seeded). */
export const LAYOUT_JITTER = 24;
