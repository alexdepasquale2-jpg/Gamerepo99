/** M4 packet-02: scheduled off-screen caravans. Pure types. */

export type CaravanHeading = 'outbound' | 'return';

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
};
