/**
 * One event-driven overlay stack for every DOM menu, sheet and modal.
 * - open / close / replace; a newly opened sheet closes the sheet already open (one at a time).
 * - Esc and keys go to the top entry only (one capture listener, see `installOverlayKeys`).
 * - Tab is trapped inside modal entries (menus and the end screens); focus returns on close.
 * - `pausing()`: true while any open entry asks the game to pause; subscribers hear every change.
 * - `claimEscape`: the scene claims Esc for its own layers (ring, room, map) when no DOM entry is open,
 *   so the root handler does not open the pause menu under them.
 * Pure logic with injectable DOM bits, so it is unit-tested in node.
 */

export type OverlayKind = 'modal' | 'menu' | 'sheet';

/** The slice of KeyboardEvent the stack reads. */
export type KeyLike = { key: string; shiftKey?: boolean; target?: unknown };

export type Focusable = { focus: () => void };

export type OverlaySpec = {
  id: string;
  kind: OverlayKind;
  /** Root element (focus trap and focus return); optional for pure use. */
  el?: { querySelectorAll?: (sel: string) => ArrayLike<Focusable> } | null;
  /** Pause the game scenes while this is open. */
  pause?: boolean;
  /** Keep Tab inside `el` (default: modal and menu). */
  trapFocus?: boolean;
  /** Esc on this entry (default: close it). */
  onEscape?: () => void;
  /** Keys other than Esc/Tab while this is the top entry; return true when handled. */
  onKey?: (e: KeyLike) => boolean;
  /** Called once whenever the entry leaves the stack (closed, replaced, or cleared). */
  onClose?: () => void;
};

export type OverlayHandle = { id: string; close: () => void; isOpen: () => boolean };

export type OverlayStack = {
  open: (spec: OverlaySpec) => OverlayHandle;
  close: (id: string) => void;
  has: (id: string) => boolean;
  top: () => OverlaySpec | undefined;
  list: () => OverlaySpec[];
  count: (...kinds: OverlayKind[]) => number;
  pausing: () => boolean;
  /** Feed a keydown; true when the stack handled it (caller stops propagation). */
  handleKey: (e: KeyLike) => boolean;
  claimEscape: (claims: () => boolean) => () => void;
  escapeClaimed: () => boolean;
  subscribe: (fn: () => void) => () => void;
  clear: () => void;
};

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createOverlayStack(env: { activeElement?: () => unknown } = {}): OverlayStack {
  const active = env.activeElement ?? (() => (typeof document !== 'undefined' ? document.activeElement : undefined));
  type Entry = OverlaySpec & { returnFocus?: unknown };
  const stack: Entry[] = [];
  const subs = new Set<() => void>();
  const claims = new Set<() => boolean>();
  const notify = (): void => { for (const fn of [...subs]) fn(); };

  const remove = (i: number, restore: boolean): void => {
    const [e] = stack.splice(i, 1);
    if (!e) return;
    e.onClose?.();
    const back = e.returnFocus as (Focusable & { isConnected?: boolean }) | undefined;
    if (restore && back && typeof back.focus === 'function' && back.isConnected !== false) back.focus();
  };

  const api: OverlayStack = {
    open(spec) {
      const at = stack.findIndex((e) => e.id === spec.id);
      if (at >= 0) remove(at, false);
      if (spec.kind === 'sheet') for (let i = stack.length - 1; i >= 0; i--) if (stack[i]!.kind === 'sheet') remove(i, false);
      const modal = spec.kind !== 'sheet';
      stack.push({ ...spec, trapFocus: spec.trapFocus ?? modal, returnFocus: modal ? active() : undefined });
      notify();
      return { id: spec.id, close: () => api.close(spec.id), isOpen: () => api.has(spec.id) };
    },
    close(id) {
      const i = stack.findIndex((e) => e.id === id);
      if (i < 0) return;
      remove(i, i === stack.length - 1);
      notify();
    },
    has: (id) => stack.some((e) => e.id === id),
    top: () => stack[stack.length - 1],
    list: () => [...stack],
    count: (...kinds) => (kinds.length ? stack.filter((e) => kinds.includes(e.kind)).length : stack.length),
    pausing: () => stack.some((e) => e.pause),
    handleKey(e) {
      const top = stack[stack.length - 1];
      if (!top) return false;
      if (e.key === 'Escape') {
        if (top.onEscape) top.onEscape();
        else api.close(top.id);
        return true;
      }
      if (e.key === 'Tab' && top.trapFocus && top.el?.querySelectorAll) {
        const items = Array.from(top.el.querySelectorAll(FOCUSABLE));
        if (!items.length) return true;
        const cur = items.indexOf(active() as Focusable);
        const next = cur < 0 ? 0 : (cur + (e.shiftKey ? -1 : 1) + items.length) % items.length;
        items[next]!.focus();
        return true;
      }
      return top.onKey ? top.onKey(e) : false;
    },
    claimEscape(fn) {
      claims.add(fn);
      return () => void claims.delete(fn);
    },
    escapeClaimed: () => [...claims].some((fn) => { try { return fn(); } catch { return false; } }),
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    clear() {
      if (!stack.length) return;
      while (stack.length) remove(stack.length - 1, false);
      notify();
    },
  };
  return api;
}

/** The game's one stack. */
export const overlays: OverlayStack = createOverlayStack();

let installed = false;
/** One capture-phase keydown listener feeds the stack (before Phaser and the game-flow root handler). */
export function installOverlayKeys(stack: OverlayStack = overlays, target: Pick<Window, 'addEventListener'> = window): void {
  if (installed && stack === overlays) return;
  if (stack === overlays) installed = true;
  target.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (stack.handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}
