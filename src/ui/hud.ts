/** Minimal M1 HUD stub — UI issues commands later; render owns the demo caption. */
export type Hud = {
  setStatus: (text: string) => void;
};

export function createHud(): Hud {
  let status = 'M1 scaffold';
  return {
    setStatus(text: string) {
      status = text;
    },
  };
}
