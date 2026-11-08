/** INTERACT area (stub). Owner: the interact agent. Replace everything in src/interact/ — keep attachInteract. See game/README.md. */
import type { GameContext, InteractApi } from '../app/contracts';

export function attachInteract(ctx: GameContext): InteractApi {
  return {
    focus: () => null,
    open: () => {},
    close: () => {},
    isOpen: () => false,
    act: (thing, verbId) => {
      const outcome = ctx.session.act(verbId, thing.target);
      ctx.events.emit('act', { actionId: verbId, target: thing.target, outcome });
      return outcome;
    },
  };
}
