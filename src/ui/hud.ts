/** Minimal HUD — status + spark readout for overworld/town. No Phaser. */

export type Hud = {
  setStatus: (text: string) => void;
  setSpark: (spark01: number) => void;
  setTown: (townId: string | null) => void;
  getStatus: () => string;
  getSpark: () => number;
  getTown: () => string | null;
};

export function createHud(): Hud {
  let status = 'M3 overworld';
  let spark = 1;
  let town: string | null = null;
  return {
    setStatus(text: string) {
      status = text;
    },
    setSpark(spark01: number) {
      spark = Math.max(0, Math.min(1, spark01));
    },
    setTown(townId: string | null) {
      town = townId;
    },
    getStatus: () => status,
    getSpark: () => spark,
    getTown: () => town,
  };
}
