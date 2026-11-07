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
};

export type DealDef = {
  id: string;
  offer: { coin?: number; standing?: number; travelSafeDays?: number; goods?: Record<string, number> };
  obligation: { kind: string; dueDays: number; magnitude: number };
  leverageOnBreak: { notorietyAdd?: number; doctrineExposureAdd?: number; betrayalSpawn?: string };
  betrayalRisk: number;
};

export type PatronDef = { id: string; name: string; doctrineId: string; homeTownId: string; openNotorietyMin: number; deals: DealDef[] };

export type PatronRules = { voiceTagsAny: string[]; hostMethodId: string; betrayalDailyScale: number; lowLegitimacyMul: number; sourMul: number; maxLettersPerDawn: number };

export type ObligationEffect = { on: 'accept' | 'fulfil'; meter: 'realDelivery' | 'perceivedDelivery' | 'propaganda' | 'control' | 'exposure'; add: number };
