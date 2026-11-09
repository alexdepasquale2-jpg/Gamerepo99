/** Pure state for WelCum HoMe. No Phaser, no DOM, no Math.random. */

export type BuildingKind =
  | 'outhouse'
  | 'well'
  | 'market_stall'
  | 'farmhouse'
  | 'bakery'
  | 'tavern'
  | 'blacksmith'
  | 'windmill'
  | 'church'
  | 'bullring'
  | 'aqueduct'
  | 'castle';

export type AiState =
  | 'doze'
  | 'lure'
  | 'seek'
  | 'windup'
  | 'strike'
  | 'recover'
  | 'reel'
  | 'grab'
  | 'tug'
  | 'brawl'
  | 'swallow'
  | 'stub';

export type ShotKind = 'loaf' | 'pottery' | 'fruit' | 'barrel' | 'blade' | 'bucket';
export type HazardKind = 'fire' | 'wine';

export type GroundTile = 'dust' | 'scrub' | 'path' | 'plaza' | 'trim' | 'olive' | 'stone';

export type HomeMap = {
  cols: number;
  rows: number;
  tile: number;
  tiles: GroundTile[];
  width: number;
  height: number;
};

export type AttackDef = {
  id: string;
  name: string;
  epitaph: string;
  /** Center distance at which the strike connects. */
  range: number;
  windupMs: number;
  activeMs: number;
  recoverMs: number;
  cooldownMs: number;
  knock: number;
  kill: boolean;
  starter: boolean;
  shot?: ShotKind;
  shotSpeed?: number;
  hazard?: HazardKind;
  aoe: number;
  stunMs: number;
};

export type BuildingDef = {
  id: BuildingKind;
  name: string;
  /** False: data only. Live worlds do not spawn them, and a forced spawn stays in `stub`. */
  playable: boolean;
  blurb: string;
  radius: number;
  speed: number;
  wake: number;
  strength: number;
  stationary: boolean;
  /** Continuous pull, px/s, while awake inside suctionRange. */
  suction: number;
  suctionRange: number;
  lure: boolean;
  /** Taverns pick a fight with whatever building is nearest. */
  brawlAll: boolean;
  rivals: BuildingKind[];
  /** Kinds a rally would call in. Church data; live rally waits until the church is playable. */
  rally: BuildingKind[];
  swallowEpitaph: string;
  attacks: AttackDef[];
};

export type HomeInput = { x: number; y: number };

export type Actor = {
  id: string;
  kind: BuildingKind;
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  vx: number;
  vy: number;
  facing: number;
  state: AiState;
  stateMs: number;
  cooldownMs: number;
  attackId: string | null;
  resolved: boolean;
  scale: number;
  swallows: number;
  brawlTarget: string | null;
  brawlCd: number;
  burstMs: number;
  contactMs: number;
  prevDist: number;
  packId: string | null;
  radius: number;
};

export type Player = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  alive: boolean;
  stunMs: number;
  slipMs: number;
  reeledBy: string | null;
  radius: number;
};

export type Shot = {
  id: number;
  ownerId: string;
  kind: BuildingKind;
  attackId: string;
  shot: ShotKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  radius: number;
  kill: boolean;
  knock: number;
  hazard: HazardKind | null;
  stunMs: number;
};

export type Hazard = {
  id: number;
  ownerId: string;
  kind: BuildingKind;
  attackId: string;
  hazard: HazardKind;
  x: number;
  y: number;
  r: number;
  ttl: number;
  tick: number;
};

export type BookEntry = {
  key: string;
  kind: BuildingKind;
  attackId: string;
  name: string;
  epitaph: string;
  count: number;
  firstAtMs: number;
};

export type BookOfEnds = {
  entries: BookEntry[];
  totalDeaths: number;
};

export type TugView = {
  winnerId: string | null;
  stalemate: boolean;
  margin: number;
};

export type HomeEvent =
  | { type: 'bonk'; x: number; y: number; text: string; shake: number; stop: number }
  | { type: 'death'; x: number; y: number; epitaph: string; key: string; shake: number; stop: number }
  | { type: 'grow'; id: string; scale: number };

export type HomeWorld = {
  seed: number;
  timeMs: number;
  map: HomeMap;
  player: Player;
  buildings: Actor[];
  shots: Shot[];
  hazards: Hazard[];
  book: BookOfEnds;
  mercyMs: number;
  contestMs: number;
  rng: { next: () => number; int: (min: number, max: number) => number };
  nextId: number;
  deaths: number;
  tug: TugView | null;
  lastEpitaph: string | null;
  epitaphMs: number;
  respawnMs: number;
};
