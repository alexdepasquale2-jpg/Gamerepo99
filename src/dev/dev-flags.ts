/** Dev/playtest switches. A playtest build is `VITE_PLAYTEST=1 vite build` (the shared artifact). */
const env = (import.meta as unknown as { env?: Record<string, string | boolean | undefined> }).env ?? {};
export const PLAYTEST = env.VITE_PLAYTEST === '1';
/** Dev tools (dev menu, fast walk) are on in `vite dev` and in playtest builds. */
export const DEV_TOOLS = !!env.DEV || PLAYTEST;

const fromUrl = Number(new URLSearchParams(globalThis.location?.search ?? '').get('speed'));
let walkMul = fromUrl > 0 ? fromUrl : PLAYTEST ? 20 : 1;
/** Overworld walk-speed multiplier: ?speed=N, else 20 in playtest builds, else 1. */
export const getWalkMul = (): number => walkMul;
export const setWalkMul = (n: number): void => { walkMul = Math.max(0.25, n); };
