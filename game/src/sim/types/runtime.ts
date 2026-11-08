import type { LettersState } from '../letters-scale';
import type { UnspokenState } from '../social/unspoken-types';
import type { CaravanMobile } from '../caravans-types';
import type { HoardState } from '../hoard/state';
import type { LegacyState } from '../legacy/types';
import type { DoctrineState } from '../doctrine-tick';
/** Runtime sim shapes assembled from data + tick state. */

import type {
  EconomyLodHooks,
  EconomyRouteState,
  TownEconomyState,
} from '../economy/economy-lod-types';

export const RUNTIME_TYPES_MODULE = 'runtime' as const;

export type EmbodimentState = {
  bodySlots: number;
  activeBodiesMax: number;
  blockedTileTags: string[];
  footprint?: unknown;
  moveTicksPerTile?: number;
  mode?: string;
  /** Overworld walk speed multiplier (1 = human pace). */
  walkSpeedMul?: number;
  /** Overworld sprite scale relative to a human body. */
  spriteScale?: number;
  /** Said when a door's entrance is blocked for this body. */
  blockedLine?: string;
  /** Names for each body when mode is multi (bodySlots of them). */
  bodyNames?: string[];
};

/** One body of a multi-body inhabitant. `at` is 'with_you' (moves with the player) or the town it waits in. */
export type BodyState = { id: string; name: string; at: string };

export type Inhabitant = {
  id: string;
  archetypeId: string;
  spark: number;
  hookIds: string[];
  statusTraits: string[];
  embodiment: EmbodimentState;
  perception?: Record<string, unknown>;
  methodMods?: Record<string, unknown>;
  sparkMax?: number;
  /** Hoarder meter (M5): earned via interactions, stashed via stash acts. */
  coin?: number;
  townId?: string;
  x?: number;
  y?: number;
  /** Where this inhabitant's home hearth is (spark profile home town, else the start town). */
  homeTownId?: string;
  /** Multi-body inhabitants only: every body and where it is. */
  bodies?: BodyState[];
  /** Multi-body inhabitants only: the body the player controls. */
  activeBodyId?: string;
};

export type PersonState = {
  id: string;
  /** Display name (authored, or deterministically generated from names.json). */
  name?: string;
  flame: number;
  flameStart?: number;
  marks?: { markId: string; stacks: number }[];
  /** 0..1 trust toward the player (mirrored from the interaction runtime). */
  trust?: number;
  townId?: string;
  siteId?: string;
  siteKind?: string;
  woundId?: string;
  tags?: string[];
  age?: number;
  x?: number;
  y?: number;
  anchor?: boolean;
};

export type PacketState = {
  id: string;
  days: number;
  kind?: string;
  fromTownId?: string;
  toTownId?: string;
  relapseMulAdd?: number;
  /** notoriety_rumor: diluted heat copy (kinDilution). */
  heat?: number;
};

export type SimState = {
  day: number;
  seed: number;
  player: Inhabitant;
  people: Record<string, PersonState>;
  flags: Record<string, unknown>;
  packets: PacketState[];
  deliveredProofs?: unknown[];
  ended?: string;
  bus?: { lastIds?: string[]; emit?: (event: string, payload: unknown) => void };
  /** Attached by boot / play session for pure resolve. */
  data?: unknown;
  rng?: unknown;
  /** Per-state reaction-line picker (see method-reactions). Never module-global. */
  reactionLineSelector?: unknown;
  /** Fabric kinship graph for cross-town ripples. */
  kinEdges?: { from: string; to: string; kind?: string }[];
  /** M4 dawn economy LOD: per-town stock/despair (seeded lazily from towns.json). */
  towns?: Record<string, TownEconomyState>;
  /** Village economy: per-town goods, daily need and shortage (see sim/economy/village-economy). */
  villageEconomy?: import('../economy/village-economy').VillageEconomy;
  /** Village logistics: shortage requests and carts on the road (see sim/economy/logistics). */
  logistics?: import('../economy/logistics').Logistics;
  /** Ambitions: build plans and land claims (see sim/economy/build-plans). */
  build?: import('../economy/build-plans').BuildState;
  /** Companies and personal purses (see sim/economy/companies). */
  companies?: import('../economy/companies').Companies;
  /** Households, children and family lines (see sim/economy/households). */
  kin?: import('../economy/households').KinState;
  /** Town borders (tension) and claim disputes (see sim/economy/borders). */
  borders?: import('../economy/borders').Borders;
  /** Diplomacy, wars, technology and creeds, run by towns (see sim/economy/polity). */
  polity?: import('../economy/polity').Polity;
  /** M4 dawn economy LOD: mutable route condition/broken (from world/routes.json). */
  economyRoutes?: EconomyRouteState[];
  /** Facility crews and idle/restaffed state by facility id (see sim/economy/facilities). Positions are re-derived from seed. */
  facilityStaff?: Record<string, import('../economy/facilities').FacilityStaff>;
  /** M4 B/C hook registry (caravan dawn, doctrine supply). Defaults to no-ops. */
  economyHooks?: EconomyLodHooks;
  /** M4 packet-02: live caravan mobiles. */
  caravans?: CaravanMobile[];
  /** Player inventory: itemId -> qty (persisted in saves). */
  inventory?: Record<string, number>;
  /** Provenance for individual goods (side table; counts in `inventory` stay authoritative). */
  itemInstances?: import('../goods/instances').ItemInstance[];
  /** Items the player set down in the world (px coords). */
  groundItems?: { id: string; itemId: string; x: number; y: number; instId?: string }[];
  hearthKeepsakes?: Record<string, { day: number; by: string }>;
  /** Per-chunk tile edits ("cx,cy" -> "q,r" -> biomeId); generated tiles are never saved. */
  tileEdits?: import('../map/tile-edits').TileEdits;
  /** Land the player worked (sim/land-acts): today's labour and a short log for townsfolk to notice. */
  landWork?: import('../land-acts').LandWork;
  /** Resource node charges: nodeId -> { charges, regrowIn } (positions are re-derived from seed). */
  worldNodes?: Record<string, { charges: number; regrowIn: number }>;
  /** Cargo the player carries for a person: delivered to someone in another town. */
  cargo?: { itemId: string; qty: number; fromPersonId: string; toTownId: string }[];
  /** Things a person lent the player when asked a favor; handed back with the return deed. */
  loans?: { itemId: string; qty: number; fromPersonId: string; day: number }[];
  /** M4 packet-02: per-route latch so route.break juices once per false->true transition. */
  routeBreakJuiced?: Record<string, boolean>;
  /** Social graph 06: Blessings and Burdens instances + bounded tuning (saveable). */
  unspoken?: UnspokenState;
  /** M4 Task C: runtime doctrine meters (seeded lazily from doctrines.json). */
  doctrines?: Record<string, DoctrineState>;
  /** M4 Task D: queued/in-flight letters and rumors. */
  letters?: LettersState;
  /** M5 Task A: notoriety, stashes, peak coin, reignite count (saveable). */
  hoard?: HoardState;
  /** M5 Task C: bond ledger, graves, legends, lineage, delta log (saveable). */
  legacy?: LegacyState;
  /** M5 Task B: patron deals by deal id (saveable). */
  patronDeals?: Record<string, import('../patrons/types').PatronDeal>;
  /** The world's generated history beats, carried into play (rebuilt from the seed on boot/load). */
  history?: import('../gen/world-types').HistoryEvent[];
  /** Beat ids each person has already retold to you (personId -> beat ids; saveable). */
  historyTold?: Record<string, string[]>;
  /** Aging, retirements and deaths: recent life events (see sim/economy/mortality; created lazily). */
  life?: import('../economy/mortality').LifeState;
  /** Legends spoken of: arrived legend lines and today's retelling (see sim/contrib/legends; created lazily). */
  legendTalk?: import('../contrib/legends').LegendTalk;
  /** Happenings in force and recently begun (see sim/happenings; saveable). */
  happenings?: import('../happenings').HappeningsState;
};
