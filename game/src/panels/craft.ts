/**
 * The craft sheet: the recipes of one station (a hearth, a workbench, a forge), what each takes and
 * makes, and what you are short of. A recipe you can't make yet is greyed with what's missing. Clicking
 * one runs the sim's own act (`craft.make.<id>@<station>`, sim/contrib/craft) so the ring and the sheet
 * share one path; the work's hours pass on the clock as a shift does. Opened by the ring's "Craft" verb.
 */
import type { GameContext, SheetDef } from '../app/contracts';
import { registerDevHook } from '../app/dev-hooks';
// A craft never pushes the day past dusk, as a shift doesn't.
import { SHIFT_PHASE_CAP } from '../interact/present';
import { craftView, goodsText, stationOf } from '../sim/craft/craft';
import { recipeHours } from '../sim/craft/recipes';
import { inventoryOf, itemName } from '../sim/goods/inventory';
import { toolsText } from '../sim/land-acts';
import { parseTargetAction, targetActionId, type Target } from '../sim/play-session/targets';
import { button, el } from './dom';

export const CRAFT_ID = 'craft';

export function craftSheet(ctx: GameContext, target: Target): SheetDef {
  let message = '';

  const make = (recipeId: string, body: HTMLElement): void => {
    const actionId = targetActionId(`craft.make.${recipeId}`, target);
    const out = ctx.session.act(actionId, target);
    message = out?.line ?? '';
    if (out?.ok) {
      ctx.voice?.sfx?.('pickup');
      if (out.hours) {
        const ph = ctx.world.phase();
        ctx.world.setPhase(Math.max(ph, Math.min(SHIFT_PHASE_CAP, ph + out.hours / 24)));
      }
    } else ctx.voice?.sfx?.('refuse');
    ctx.events.emit('act', { actionId, target, ...(out ? { outcome: out } : {}) });
    ctx.events.emit('inventory', {});
    def.render(body);
  };

  const def: SheetDef = {
    id: CRAFT_ID,
    title: 'Craft',
    render(body) {
      body.replaceChildren();
      const st = ctx.session.getState();
      const at = st && stationOf(st, target);
      if (!st || !at) { body.append(el('p', 'hf-muted', 'There is nothing here to work at.')); return; }
      body.append(el('h3', 'hf-subhead', at.name));
      const inv = inventoryOf(st);
      for (const v of craftView(st, at.station)) {
        const r = v.recipe;
        const takes = goodsText(r.in);
        const tool = r.tool?.length ? `, with ${toolsText(r.tool)}` : '';
        const hours = recipeHours(r);
        const row = el('div', `hf-sheet-actions${v.ok ? '' : ' hf-muted'}`);
        row.append(button(`${r.label}: ${takes}${tool} → ${goodsText(r.out)}`, () => make(r.id, body), { disabled: !v.ok, id: `craft-${r.id}`, title: `${hours} hour${hours === 1 ? '' : 's'} of work` }));
        if (!v.ok) row.append(el('span', 'hf-small', `Short: ${v.short.join(', ')}.`));
        body.append(row);
      }
      const carried = Object.entries(inv).filter(([id, n]) => id !== 'coin' && n > 0).map(([id, n]) => `${n} ${itemName(id).toLowerCase()}`);
      body.append(el('p', 'hf-muted hf-small', `You carry: ${carried.length ? carried.join(', ') : 'nothing to work with'}.`));
      body.append(el('p', 'hf-note hf-small', message));
    },
  };
  return def;
}

/** Open the sheet when the ring's Craft verb says so. */
export function watchCraftVerbs(ctx: GameContext, open: (def: SheetDef) => void): () => void {
  return ctx.events.on('act', (e) => {
    if (!e.outcome?.ok || parseTargetAction(e.actionId)?.verb !== 'craft.open') return;
    open(craftSheet(ctx, e.target));
  });
}

// ---- QA hook (window.__hearth.dev.craft): run the ring's Craft verb on a station target. ----
registerDevHook('craft', (ctx) => (kind: Target['kind'] = 'hearth', id?: string) => {
  const target: Target = { kind, id: id ?? ctx.session.snapshot().townId };
  const actionId = targetActionId('craft.open', target);
  const outcome = ctx.session.act(actionId, target);
  ctx.events.emit('act', { actionId, target, ...(outcome ? { outcome } : {}) });
  return outcome ?? null;
});
