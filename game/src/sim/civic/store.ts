/**
 * Stores: where a good physically sits (a site's shelves, a pantry, a cart, a satchel). Goods only enter a
 * store from a named source (production, a gift, a harvest) and only leave it to a named sink (eating,
 * spoilage, loss) or to another store, and every one of those moves can be written to a bounded
 * conservation log, so a test can sum the log and prove nothing appeared or vanished.
 *
 * This wave the town ledger stays authoritative for goods (sites read it); stores carry the site's own
 * till log and are where wave 2 moves the goods. Pure: no SimState, no Phaser/DOM.
 */

export type Store = { items: Record<string, number>; capacity: number; spoilage: number };

/** One move. `from`/`to` are store labels, or a named source/sink such as `source:production`, `sink:eaten`. */
export type LogEntry = { day: number; from: string; to: string; item: string; qty: number; why: string };
export type ConservationLog = { entries: LogEntry[]; keep: number };

const EPS = 1e-9;

export const makeStore = (capacity = Infinity, spoilage = 0): Store => ({ items: {}, capacity, spoilage });
export const makeLog = (keep = 200): ConservationLog => ({ entries: [], keep });

/** Everything in the store, or one item. */
export function total(store: Store, item?: string): number {
  if (item !== undefined) return Math.max(0, store.items[item] ?? 0);
  return Object.values(store.items).reduce((n, q) => n + Math.max(0, q), 0);
}

export const room = (store: Store): number => Math.max(0, store.capacity - total(store));

function note(log: ConservationLog | undefined, e: LogEntry): void {
  if (!log || e.qty <= EPS) return;
  log.entries.push(e);
  if (log.entries.length > log.keep) log.entries.splice(0, log.entries.length - log.keep);
}

const tidy = (store: Store, item: string): void => {
  if ((store.items[item] ?? 0) <= EPS) delete store.items[item];
};

export type MoveCtx = { day?: number; log?: ConservationLog; label?: string };

/** Put up to `qty` of an item in (bounded by room). Returns what went in; the rest stays wherever it came from. */
export function put(store: Store, item: string, qty: number, source: string, ctx: MoveCtx = {}): number {
  const n = Math.min(Math.max(0, qty), room(store));
  if (n <= EPS) return 0;
  store.items[item] = (store.items[item] ?? 0) + n;
  note(ctx.log, { day: ctx.day ?? 0, from: source, to: ctx.label ?? 'store', item, qty: n, why: 'put' });
  return n;
}

/** Take up to `qty` of an item out to a sink. Returns what came out. */
export function take(store: Store, item: string, qty: number, sink: string, ctx: MoveCtx = {}): number {
  const n = Math.min(Math.max(0, qty), total(store, item));
  if (n <= EPS) return 0;
  store.items[item] = (store.items[item] ?? 0) - n;
  tidy(store, item);
  note(ctx.log, { day: ctx.day ?? 0, from: ctx.label ?? 'store', to: sink, item, qty: n, why: 'take' });
  return n;
}

/** Move up to `qty` between stores: limited by what `from` holds and the room `to` has. Never creates or loses goods. */
export function move(from: Store, to: Store, item: string, qty: number, ctx: MoveCtx & { toLabel?: string } = {}): number {
  const n = Math.min(Math.max(0, qty), total(from, item), room(to));
  if (n <= EPS) return 0;
  from.items[item] = (from.items[item] ?? 0) - n;
  tidy(from, item);
  to.items[item] = (to.items[item] ?? 0) + n;
  note(ctx.log, { day: ctx.day ?? 0, from: ctx.label ?? 'store', to: ctx.toLabel ?? 'store', item, qty: n, why: 'move' });
  return n;
}

/** One dawn of spoilage (store.spoilage share of each good) into the named sink. Returns what was lost. */
export function spoil(store: Store, ctx: MoveCtx = {}): number {
  if (!(store.spoilage > 0)) return 0;
  let lost = 0;
  for (const item of Object.keys(store.items).sort()) lost += take(store, item, total(store, item) * store.spoilage, 'sink:spoiled', ctx);
  return lost;
}

/**
 * Net change the log accounts for at a label (what came in minus what went out). With every move logged,
 * total(store) after == total before + net(log, label): the conservation test.
 */
export function net(log: ConservationLog, label: string, item?: string): number {
  let n = 0;
  for (const e of log.entries) {
    if (item !== undefined && e.item !== item) continue;
    if (e.to === label) n += e.qty;
    if (e.from === label) n -= e.qty;
  }
  return n;
}
