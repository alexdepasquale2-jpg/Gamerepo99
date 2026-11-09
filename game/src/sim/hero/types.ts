/**
 * The hero: the action layer's side of the inhabitant. Level and experience, three attributes (might,
 * grit, wits), health (spark is the mana), gear in three slots plus a bag, skills by rank and the three
 * slotted on Q / R / F, and the marks the fighting leaves on the world: kills by family, lairs cleared,
 * wild packs cleared today, towns weakened before your band's battles. Saved on SimState.hero (lazy).
 */
export type Attr = 'might' | 'grit' | 'wits';
export type Slot = 'weapon' | 'armor' | 'charm';
export type Affix = { stat: string; value: number };
export type GearItem = { id: string; base: string; rarity: string; level: number; name: string; affixes: Affix[] };

export type HeroNews = { day: number; text: string; townId?: string };

export type HeroState = {
  v: 1;
  level: number;
  xp: number;
  hp: number;
  attrs: Record<Attr, number>;
  points: { attr: number; skill: number };
  skills: Record<string, number>;
  slots: (string | null)[];
  gear: Partial<Record<Slot, GearItem>>;
  bag: GearItem[];
  /** Foes slain, by family and by kind. */
  kills: Record<string, number>;
  slain: Record<string, number>;
  /** Lair id -> the day it was cleared (it stirs again after LAIR_RESPAWN days). */
  lairs: Record<string, number>;
  /** Wild cell key -> the day its pack was cleared (a new pack may come the next day). */
  cleared: Record<string, number>;
  /** Town id -> its soldiers you have cut down since its last battle (each lowers its defence). */
  weakened: Record<string, number>;
  /** Days bandits were slain lately (the roads are safer for a while). */
  banditDays: number[];
  deaths: number;
  /** Loot rolls so far (the loot rng's counter). */
  rolls: number;
  news: HeroNews[];
};

export type Stats = {
  maxHp: number; armor: number; dmg: [number, number]; rate: number; reach: number; arc: number; shot: number;
  crit: number; leech: number; sparkHit: number; move: number; sparkRegen: number; xpMul: number;
  might: number; grit: number; wits: number;
};
