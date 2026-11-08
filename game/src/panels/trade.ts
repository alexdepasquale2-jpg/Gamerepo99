/**
 * Trade with a wagon on the road: the shop sheet (panels/shop) on a `wagon` shop ref, with prices shaped
 * by the shortages of the town the wagon is bound for (sim/goods/caravan-trade via sim/goods/shop). The
 * sheet keeps the `trade` id: while it is open the wagon is "stopped" (panels.trade.current()), so the
 * actors area can hold it in place.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { caravanStatus } from '../sim/caravan-visit';
import { wagonDestination } from '../sim/goods/caravan-trade';
import { townNamer } from './dom';
import { shopSheet } from './shop';

export const TRADE_ID = 'trade';

export function tradeSheet(ctx: GameContext, caravanId: string, onClose: () => void): SheetDef {
  const nameOf = townNamer(ctx);
  const subtitle = (): string => {
    const st = ctx.session.getState();
    const m = st?.caravans?.find((c) => c.id === caravanId);
    if (!st || !m) return 'The wagon has moved on.';
    const dest = wagonDestination(st, m);
    return `${caravanStatus(m)}${dest ? ` · bound for ${nameOf(dest)}: it pays more for what they are short of` : ''}`;
  };
  const def = shopSheet(ctx, { kind: 'wagon', id: caravanId }, onClose, { id: TRADE_ID, subtitle });
  const st = ctx.session.getState();
  const m = st?.caravans?.find((c) => c.id === caravanId);
  const dest = st && m ? wagonDestination(st, m) : undefined;
  return { ...def, title: `Roadside trader${dest ? ` · bound for ${nameOf(dest)}` : ''}` };
}
