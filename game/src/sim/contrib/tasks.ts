/**
 * Tasks on the shared surfaces (sim/tasks):
 *   - dawn tick ('late'): site, facility and pot effort from yesterday pays out; yesterday's help is remembered
 *   - dawn lines: the people you worked beside tell of it
 *   - the work spot itself (a `prop:work@<taskId>` Thing): one quiet verb, so the prompt names it and a tap
 *     says what to do. The help itself is a hold of E (interact/hold.ts → session.workAt), never a menu.
 */
import { registerDawnLines } from '../dawn-lines';
import { registerDawnTick } from '../dawn-ticks';
import { registerTargetProvider } from '../play-session/action-providers';
import { targetActionId, type Target } from '../play-session/targets';
import { applyTaskDawn, taskById, taskDawnLines, taskHint, TASKS, nameOf } from '../tasks';
import type { SimState } from '../types/runtime';

registerDawnTick('late', 'tasks-help', applyTaskDawn);
registerDawnLines('tasks-help', taskDawnLines);

const HINT_VERB = 'task.hint';
/** The task a work-spot target is for (its data carries the id; the target id is `work@<taskId>`). */
const taskOfTarget = (state: SimState, t: Target) => {
  const d = t.data as { workSpot?: string } | undefined;
  if (t.kind !== 'prop' || !(d?.workSpot ?? t.id.startsWith('work@'))) return undefined;
  return taskById(state, d?.workSpot ?? t.id);
};

registerTargetProvider({
  id: 'task-spots',
  kinds: ['prop'],
  list(state, t) {
    const task = taskOfTarget(state, t);
    if (!task) return [];
    const lead = task.workers[0];
    return [{ id: targetActionId(HINT_VERB, t), label: lead ? `Help ${nameOf(state, lead)}` : 'Lend a hand', short: 'Hold to help', family: 'help' }];
  },
  act(state, actionId, t) {
    if (!actionId.startsWith(`${HINT_VERB}@`)) return false;
    const task = taskOfTarget(state, t);
    return { ok: true, line: task ? taskHint(state, task) : TASKS.gone };
  },
});
