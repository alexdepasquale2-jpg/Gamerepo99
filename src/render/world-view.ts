/**
 * Render-side view types mirroring Loom WorldRenderSnapshot fields.
 * Sim may emit a thinner stub; Forge should treat these as the presentation contract.
 * No colors / sprites here — only keys, warmth, heading, positions.
 */

export type TileRenderView = {
  q: number;
  r: number;
  biomeId: string;
  warmth: number;
};

export type FacilityRenderView = {
  id: string;
  type: string;
  state: 'idle' | 'working' | 'abandoned';
  warmth: number;
  position: { x: number; y: number };
};

export type MobileRenderView = {
  id: string;
  type: string;
  state: 'idle' | 'traveling' | 'working' | 'fleeing' | 'broken';
  heading: number;
  position: { x: number; y: number };
};

export type WorldRenderViews = {
  day: number;
  tick: number;
  tiles: TileRenderView[];
  facilities: FacilityRenderView[];
  mobiles: MobileRenderView[];
};

/** Asset key helpers for Forge wiring. */
export function biomeAssetKey(biomeId: string): string {
  return `biome.${biomeId}`;
}

export function facilityAssetKey(type: string, state: FacilityRenderView['state']): string {
  return `facility.${type}.${state}`;
}

export function mobileAssetKey(type: string): string {
  // Caravan roles and fauna share mobile channel; prefer caravan.* then fauna.*
  if (type.startsWith('caravan.') || type.startsWith('fauna.')) return type;
  if (type.includes('.')) return type;
  return `caravan.${type}`;
}
