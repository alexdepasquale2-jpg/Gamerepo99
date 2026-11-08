/** Authored moments: the beat you hear on waking when a moment landed overnight (sim/scenario/moments-live). */
import { registerDawnLines } from '../dawn-lines';
import { momentDawnLines } from '../scenario/moments-live';

registerDawnLines('moments', momentDawnLines);
