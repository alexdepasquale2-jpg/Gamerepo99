/**
 * The Garage tab: your vehicles here (stats, mods, mending, driving yourself down the road), the designs
 * the assembly yard can put together, the Wright's catalogue of ready parts and vehicles, and the voyage.
 */
import { DESIGN_BY_ID, MOD_BY_ID, TUNING, VOYAGES, goodName } from '../../sim/works/data';
import { launch, voyageCheck } from '../../sim/works/feast-voyage';
import { depotAt, reachable, townName, worksIfAny } from '../../sim/works/state';
import type { Result } from '../../sim/works/types';
import {
  assemble, buyPart, buyWhole, catalogueParts, designsView, drive, driveDays, fitMod, modsFor, partPrice, repair, repairCost, statsOf, vehiclesIn,
} from '../../sim/works/vehicles';
import { el } from '../dom';
import { btn, recipeText, row, section, type WorksUi } from './kit';

export function renderGarage(ui: WorksUi, body: HTMLElement): void {
  const { st, town, here, ctx } = ui;
  if (!depotAt(st, town)) { body.append(el('p', 'hf-muted', 'Take on a yard here first (Yard tab).')); return; }

  const mine = section(`Vehicles in ${townName(st, town)}`);
  const vs = vehiclesIn(st, town);
  if (!vs.length) mine.append(el('p', 'hf-muted hf-small', 'None yet. Put one together below, or buy one ready-built.'));
  for (const v of vs) {
    const d = DESIGN_BY_ID.get(v.design)!;
    const s = statsOf(v);
    const mods = v.mods.map((m) => MOD_BY_ID.get(m)?.name ?? m).join(', ') || 'no mods';
    const detail = `${d.name} · cargo ${s.cap} · speed ${s.speed} · armour ${s.armor} · fire ${s.fire} · ${Math.round(v.condition * 100)}% sound · ${mods} (${v.mods.length}/${d.slots}) · ${v.job === 'idle' ? 'idle' : `with the ${v.job}`}`;
    const buttons = [btn('Mend', () => ui.run((x) => repair(x, v.id), 'repair'), { disabled: v.condition >= 0.99, title: `Costs ${recipeText(repairCost(v), {}).replace(/ → $/, '')}` })];
    for (const m of modsFor(st, v).slice(0, 4)) {
      const row0 = MOD_BY_ID.get(m)!;
      buttons.push(btn(`+ ${row0.name}`, () => ui.run((x) => fitMod(x, v.id, m), 'mod'), { disabled: v.mods.length >= d.slots || v.job !== 'idle', title: `${row0.blurb} Needs ${recipeText(row0.parts, {}).replace(/ → $/, '')}.` }));
    }
    mine.append(row(v.name, detail, buttons));
    if (v.job === 'idle' && town === here) mine.append(driveRow(ui, v.id));
  }
  body.append(mine);

  const designs = section('Designs', 'The assembly yard puts these together from parts (a handcart needs only a yard). Parts come from your lines, or the catalogue below.');
  for (const v of designsView(st, town)) {
    const r = v.row;
    const why = v.blocked.length ? `Needs ${v.blocked.join(' and ')}.` : v.short.length ? `Short: ${v.short.join(', ')}.` : 'Ready to put together.';
    designs.append(row(r.name, `${r.blurb} Cargo ${r.cap} · speed ${r.speed} · armour ${r.armor} · fire ${r.fire}${Object.keys(r.fuel).length ? ` · burns ${recipeText(r.fuel, {}).replace(/ → $/, '')} a trip` : ''}. Parts: ${recipeText(r.parts, {}).replace(/ → $/, '')}. ${why}`, [
      btn('Assemble', () => ui.run((x) => assemble(x, town, r.id), 'assemble'), { disabled: v.blocked.length > 0 || v.short.length > 0, hot: true, id: `works-assemble-${r.id}` }),
      btn(`Buy (${v.price})`, () => ui.run((x) => buyWhole(x, town, r.id), 'buy'), { disabled: v.blocked.some((b) => b !== 'an assembly yard'), title: "Ready-built from the Wright's, delivered to this yard" }),
    ], v.blocked.length ? 'is-locked' : ''));
  }
  body.append(designs);

  const cat = section("The Wright's catalogue", 'Ready-made parts, delivered to this yard at a markup. Coin can stand in for a line you have not built yet.');
  const acts = el('div', 'hf-works-row__acts');
  for (const id of catalogueParts(st)) acts.append(btn(`${goodName(id)} (${partPrice(id)})`, () => ui.run((x) => buyPart(x, town, id), 'part')));
  cat.append(acts);
  body.append(cat);

  const vc = voyageCheck(st, town);
  if (vc.leg <= VOYAGES.length && (depotAt(st, town)?.buildings.includes('sky_dock') || worksIfAny(st)?.voyage)) {
    const s = section('Past the edge of the map', `Voyage ${vc.leg} of ${VOYAGES.length}: ${VOYAGES[vc.leg - 1]!.name}. Takes ${TUNING.voyageRations} rations and ${TUNING.voyageFuel} charcoal.`);
    const vy = worksIfAny(st)?.voyage;
    s.append(row(vy ? `In the air: ${vy.daysLeft} days to go` : 'Launch the airship', vc.short.length && !vy ? `Needs ${vc.short.join(', ')}.` : '', [btn('Launch', () => ui.run((x) => launch(x, town), 'voyage'), { disabled: vc.short.length > 0, hot: true, id: 'works-launch' })]));
    body.append(s);
  }
  void ctx;
}

function driveRow(ui: WorksUi, vehicleId: string): HTMLElement {
  const { st, ctx } = ui;
  const v = worksIfAny(st)?.vehicles.find((x) => x.id === vehicleId);
  const wrap = el('div', 'hf-works-row__acts');
  if (!v) return wrap;
  const pick = el('select', 'hf-works-select', undefined, { 'aria-label': `Drive ${v.name} to` });
  for (const t of reachable(st, v.townId)) {
    const o = el('option', '', `${townName(st, t.townId)} (${driveDays(st, v, t.townId)}d)`);
    o.value = t.townId;
    pick.append(o);
  }
  if (!pick.options.length) return wrap;
  const go = btn(`Drive ${v.name}`, () => {
    const to = pick.value;
    const r = ui.run((x) => drive(x, v.id, to), 'drive') as Result & { days?: number };
    if (!r.ok || !r.days) return;
    ctx.panels.closeAll();
    ctx.session.wait(r.days);
    const state = ctx.session.getState();
    if (state) state.player.townId = to;
    ctx.arriveAt(to);
    ctx.events.emit('inventory', {});
    ctx.autosave();
    ctx.voice?.tell(`Day ${ctx.session.snapshot().day}. ${townName(st, to)}, by ${v.name}.`, 'player');
  }, { title: 'The days pass on the road; fuel comes from this yard.' });
  wrap.append(pick, go);
  return wrap;
}
