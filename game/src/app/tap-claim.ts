/**
 * One tap, one meaning: an area that takes a tap on the world for itself (combat: a tap on a foe is an
 * attack) claims it, and tap-to-walk lets a claimed tap go. The claim lasts until the walk handler reads it.
 */
let claimedAt = -1;
export function claimTap(): void { claimedAt = performance.now(); }
/** True (once) when a tap in the last moment was claimed. */
export function tapClaimed(): boolean {
  const c = performance.now() - claimedAt < 250;
  claimedAt = -1;
  return c;
}
