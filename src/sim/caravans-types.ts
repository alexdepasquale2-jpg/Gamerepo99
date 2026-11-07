/** M4 packet-02: scheduled off-screen caravans. Pure types. */

export type CaravanHeading = 'outbound' | 'return';

/** Absent = rolling along the road. Otherwise the wagon is halted at a town. */
export type CaravanPhase = 'unloading' | 'trading' | 'departing';

/** Book-keeping for the stop in progress, so the view and tests can read what really moved. */
export type CaravanVisit = {
  townId: string;
  resourceId: string;
  /** Crates this wagon arrived with, and how many are already in the town's stock. */
  total: number;
  moved: number;
  /** Units delivered while the town was short of the good (each one eased despair). */
  relieved: number;
  /** Surplus bought from the town for the way back. */
  bought?: { resourceId: string; qty: number };
  prism?: string;
};

export type CaravanScheduleRow = {
  id: string;
  routeId: string;
  departDawnMod: number;
  periodDays: number;
  cargoResourceId: string;
  qty: number;
  lean: string;
  prism?: string;
  /** Live-mobile cap per schedule; omitted reads as 2. */
  maxConcurrent?: number;
};

export type CaravanMobile = {
  id: string;
  scheduleId: string;
  routeId: string;
  /** 0 at current leg start, 1 at leg end. */
  progress01: number;
  heading: CaravanHeading;
  cargoResourceId: string;
  qty: number;
  dawnSpawned: number;
  /** Fractional travel already applied before the next dawn. */
  travelCredit?: number;
  coin?: number;
  /** Set while halted at a town; phaseLeft counts game days remaining in the phase. */
  phase?: CaravanPhase;
  phaseLeft?: number;
  visit?: CaravanVisit;
};
