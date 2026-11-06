/** Method menu — UI lists actions; caller commits via session.act. No Phaser. */

import type { PlayAction } from '../sim';

export type MethodMenuItem = {
  id: string;
  label: string;
  family?: string;
};

export type MethodMenu = {
  items: (actions: PlayAction[]) => MethodMenuItem[];
  show: (
    actions: PlayAction[],
    onPick: (actionId: string) => void,
  ) => MethodMenuItem[];
  hide: () => void;
  visible: () => boolean;
};

function labelFor(action: PlayAction): string {
  const at = action.id.indexOf('@');
  if (at <= 0) return action.id;
  const methodId = action.id.slice(0, at);
  const personId = action.id.slice(at + 1);
  const family = action.family ? ` [${action.family}]` : '';
  return `${methodId} → ${personId}${family}`;
}

/** Pure method menu helper used by town scene via registry / main wiring. */
export function createMethodMenu(): MethodMenu {
  let open = false;
  return {
    items(actions) {
      return actions.map((a) => ({
        id: a.id,
        label: labelFor(a),
        family: a.family,
      }));
    },
    show(actions, _onPick) {
      open = true;
      return this.items(actions);
    },
    hide() {
      open = false;
    },
    visible: () => open,
  };
}
