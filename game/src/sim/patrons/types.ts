export type PatronDealStatus = 'active' | 'fulfilled' | 'broken' | 'betrayed' | 'void';

export type PatronDeal = {
  dealId: string;
  patronId: string;
  acceptedDay: number;
  dueDay: number;
  status: PatronDealStatus;
  /** Reignite count at accept (deny_reignite is judged against it). */
  reigniteAtAccept: number;
  /** Doctrine exposure at accept; later rises (act_expose_lie) sour the deal. */
  exposureAtAccept: number;
  /** Day the deal stopped being active (kept, broken, betrayed or voided). Optional for old saves. */
  endedDay?: number;
  /**
   * The doctrine the deal was made with (the patron's, by role, in the world where it was struck). Deals travel
   * with the player; in a world without that doctrine the deal waits (no betrayal, no nudges) until it falls due.
   * Absent on older saves: the patron's doctrine in the current world.
   */
  doctrineId?: string;
};

export type DealDef = {
  id: string;
  /** Short words for the deal in chips and lines ("tithe", "caravan"). */
  terms?: string;
  offer: { coin?: number; standing?: number; travelSafeDays?: number; goods?: Record<string, number> };
  obligation: { kind: string; dueDays: number; magnitude: number };
  leverageOnBreak: { notorietyAdd?: number; doctrineExposureAdd?: number; betrayalSpawn?: string };
  betrayalRisk: number;
};

export type PatronDef = {
  id: string;
  name: string;
  /** Chip-sized name ("Wardens"). */
  shortName?: string;
  doctrineId: string;
  homeTownId: string;
  openNotorietyMin: number;
  deals: DealDef[];
};

export type PatronRules = {
  voiceTagsAny: string[];
  hostMethodId: string;
  betrayalDailyScale: number;
  lowLegitimacyMul: number;
  sourMul: number;
  maxLettersPerDawn: number;
  /** Dawn warnings start this many days before a deal falls due. */
  warnDays?: number;
};

export type ObligationEffect = { on: 'accept' | 'fulfil'; meter: 'realDelivery' | 'perceivedDelivery' | 'propaganda' | 'control' | 'exposure'; add: number };

/** In-voice templates (patrons.json `lines`). */
export type PatronLines = {
  offerPart: Record<string, string>;
  obligation: Record<string, string>;
  offer: string;
  offerDeal: string;
  offerJoin: string;
  closed: string[];
  taken: string[];
  due: string[];
  /** Deals kept by not doing something (no deliver act). */
  dueSoft?: string[];
  broken: string[];
  betrayed: string[];
  kept: string[];
  void: string[];
};
