/** ASCII glyphs for the map ladder. Area glyphs map 1:1 to terrain biomes. */
import type { Biome } from '../terrain';

export const AREA_GLYPH: Record<Biome, string> = { water: '~', hills: '^', forest: 'T', fields: ',', meadow: '.' };
export const GLYPH_AREA: Record<string, Biome> = Object.fromEntries(
  Object.entries(AREA_GLYPH).map(([b, g]) => [g, b as Biome]),
) as Record<string, Biome>;
export const ROAD = '=';
export const TOWN = '#';
/** Stable order for ties and hashing. */
export const AREA_ORDER: Biome[] = ['water', 'hills', 'forest', 'fields', 'meadow'];
