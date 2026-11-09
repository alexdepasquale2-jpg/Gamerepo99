/** The War tab: raise a band, enlist, arm, bring war machines, feed it, march, and your vassals. */
import { TUNING } from '../../sim/works/data';
import { rationsIn } from '../../sim/works/lines';
import { hasBuilding, personFirst, townName, worksIfAny } from '../../sim/works/state';
import { isWarMachine, statsOf, vehiclesIn } from '../../sim/works/vehicles';
import { arm, attach, bandCap, bandOf, detach, dismiss, enlist, friendly, isVassal, march, marchRations, powerOf, raiseBand, release, warTargets } from '../../sim/works/war';
import { el } from '../dom';
import { btn, row, section, type WorksUi } from './kit';

export function renderWar(ui: WorksUi, body: HTMLElement): void {
  const { st, town } = ui;
  const b = bandOf(st);
  if (!b) {
    const s = section('No war band', 'A band is raised at a barracks (Yard tab, Cart Age). Soldiers eat a ration each dawn; a hungry band loses heart, then soldiers. The fallen are sent home wounded.');
    s.append(row('Raise a band here', hasBuilding(st, town, 'barracks') ? `In ${townName(st, town)}.` : `Needs a barracks in your ${townName(st, town)} yard.`, [btn('Raise', () => ui.run((x) => raiseBand(x, town), 'band'), { disabled: !hasBuilding(st, town, 'barracks'), hot: true, id: 'works-raise-band' })]));
    body.append(s);
    vassals(ui, body);
    return;
  }
  const p = powerOf(st);
  const where = b.march ? `marching on ${townName(st, b.march.target)} (${b.march.daysLeft}d)` : `in ${townName(st, b.townId)}`;
  const s = section(`Your band, ${where}`, `${p.soldiers}/${bandCap(st)} soldiers · power ${p.total} (arms ${p.attack}, guard ${p.guard}, machines ${p.machines}) · heart ${Math.round(b.morale * 100)}% · ${rationsIn(st, b.townId)} rations in the yard here`);
  const kit = Object.entries(b.kit).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`).join(', ') || 'no arms';
  s.append(row('Soldiers', `${b.soldiers.map((id) => personFirst(st, id)).join(', ') || 'nobody yet'} · ${kit}`, [
    btn(`Enlist (${TUNING.enlistCoin})`, () => ui.run((x) => enlist(x), 'enlist'), { disabled: !!b.march || p.soldiers >= bandCap(st), id: 'works-enlist', title: 'Takes the first free person where the band stands; or use Enlist on someone in the world.' }),
    btn('Send one home', () => ui.run((x) => dismiss(x), 'dismiss'), { disabled: !p.soldiers || !!b.march }),
    btn('Draw arms', () => ui.run((x) => arm(x), 'arm'), { disabled: !!b.march, title: 'Spears, shields, mail and muskets from the yard where the band stands' }),
  ]));
  for (const id of b.vehicles) {
    const v = worksIfAny(st)?.vehicles.find((x) => x.id === id);
    if (v) s.append(row(v.name, `fire ${statsOf(v).fire} · armour ${statsOf(v).armor} · ${Math.round(v.condition * 100)}% sound`, [btn('Stand down', () => ui.run((x) => detach(x, v.id), 'detach'), { disabled: !!b.march })]));
  }
  if (!b.march) for (const v of vehiclesIn(st, b.townId).filter((x) => x.job === 'idle')) {
    s.append(row(`${v.name}${isWarMachine(v) ? ' (war machine)' : ''}`, `fire ${statsOf(v).fire} · armour ${statsOf(v).armor}${statsOf(v).stove ? ' · field stove' : ''}`, [btn('Bring along', () => ui.run((x) => attach(x, v.id), 'attach'))]));
  }
  body.append(s);

  if (!b.march) {
    const m = section('March', 'To a town of yours to move the band; on any other to take it. Provisions for the road come from the yard where the band stands.');
    for (const t of warTargets(st).slice(0, 10)) {
      const ours = friendly(st, t.townId);
      const need = marchRations(st, t.days);
      const odds = ours ? '' : p.total > t.defence * 1.25 ? ' · they will likely fall' : p.total > t.defence * 0.8 ? ' · a close fight' : ' · they are stronger';
      m.append(row(townName(st, t.townId), `${t.days}d · ${need} rations${ours ? ' · yours' : ` · defence ${t.defence}${odds}`}`, [btn(ours ? 'Move' : 'Attack', () => ui.run((x) => march(x, t.townId), ours ? 'move' : 'march'), { disabled: !p.soldiers, hot: !ours, id: `works-march-${t.townId}` })]));
    }
    body.append(m);
  }
  vassals(ui, body);
}

function vassals(ui: WorksUi, body: HTMLElement): void {
  const { st } = ui;
  const list = worksIfAny(st)?.vassals ?? [];
  const s = section('Vassals', `Each pays ${TUNING.tributeCoin} coin a dawn. Conquest brings despair; when it runs high a town may rise, unless the band stands guard or it has feasted.`);
  if (!list.length) s.append(el('p', 'hf-muted hf-small', 'No town answers to you yet.'));
  for (const v of list) {
    const d = st.towns?.[v.townId]?.despair ?? 0;
    s.append(row(townName(st, v.townId), `since day ${v.since} · despair ${Math.round(d * 100)}%${(v.feastUntil ?? 0) >= st.day ? ' · feasted' : ''}`, [btn('Set free', () => ui.run((x) => release(x, v.townId), 'free'), { disabled: !isVassal(st, v.townId) })]));
  }
  body.append(s);
}
