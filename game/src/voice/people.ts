/**
 * Who can carry a line: names and towns from the session, heads and nearness from ctx.actors.
 * Read-only; refreshed lazily (dawn newcomers, loads) when an id is missing.
 */
import type { GameContext, Pt } from '../app/contracts';

export type PersonInfo = { id: string; name: string; given: string; townId?: string };

/** How far (world px) from the player a villager may be to carry town news. */
const NEAR_PX = 420;

export type People = ReturnType<typeof createPeople>;

export function createPeople(ctx: GameContext) {
  let byId = new Map<string, PersonInfo>();
  let lastRefresh = -Infinity;
  let busy: (id: string) => boolean = () => false;

  const refresh = (): void => {
    const next = new Map<string, PersonInfo>();
    try {
      for (const p of ctx.session.listPeople()) {
        const name = p.name ?? '';
        next.set(p.id, { id: p.id, name, given: name.split(/\s+/)[0] ?? '', townId: p.townId });
      }
    } catch { /* session between states */ }
    byId = next;
    lastRefresh = performance.now();
  };

  const info = (id: string): PersonInfo | undefined => {
    let p = byId.get(id);
    // Someone born, grown or arrived since we looked: look again, at most once a second.
    if (!p && performance.now() - lastRefresh > 1000) {
      refresh();
      p = byId.get(id);
    }
    return p;
  };

  const playerTown = (): string | undefined => {
    try { return ctx.session.getState()?.player?.townId ?? undefined; } catch { return undefined; }
  };

  const playerAt = (): Pt => ctx.actors.player.pos();

  /** People the player can see, nearest first (ids with a head). */
  const visible = (): string[] => {
    const at = playerAt();
    let things: ReturnType<typeof ctx.actors.things> = [];
    try { things = ctx.actors.things(at, NEAR_PX); } catch { return []; }
    return things
      .filter((t) => t.kind === 'person' && t.id !== 'player' && !!ctx.actors.headOf(t.id))
      .map((t) => ({ id: t.id, d: Math.hypot(t.x - at.x, t.y - at.y) }))
      .sort((a, b) => a.d - b.d)
      .map((t) => t.id);
  };

  /**
   * Someone in sight to carry a town-level line: the nearest who isn't already talking, else the nearest.
   * Undefined when the line is about another town (that news travels by letter or dawn) or nobody is near.
   */
  const carrier = (townId?: string, excludeId?: string): string | undefined => {
    const here = playerTown();
    if (townId && here && townId !== here) return undefined;
    const folk = visible();
    const others = folk.filter((id) => id !== excludeId);
    return others.find((id) => !busy(id)) ?? others[0] ?? folk[0];
  };

  refresh();
  return {
    /** Who is already talking (so town news spreads across the crowd). */
    setBusy: (fn: (id: string) => boolean): void => { busy = fn; },
    refresh,
    info,
    nameOf: (id: string): string | undefined => info(id)?.name || undefined,
    givenOf: (id: string): string | undefined => info(id)?.given || undefined,
    townOf: (id: string): string | undefined => info(id)?.townId,
    playerTown,
    visible,
    carrier,
    all: (): PersonInfo[] => [...byId.values()],
    hasHead: (id: string): boolean => !!ctx.actors.headOf(id),
  };
}
