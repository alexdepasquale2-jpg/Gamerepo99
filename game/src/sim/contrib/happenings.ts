/** Happenings: what people say began in a town this dawn (grey rain over Chalk Warren…). */
import { registerDawnLines } from '../dawn-lines';
import { happeningDawnLines } from '../happenings';
import { registerBoardPage } from '../board-pages';
import { storyDawnLines, tidings } from '../storyteller';

registerDawnLines('happenings', happeningDawnLines);
// The storyteller's own incidents (raids, frosts, windfalls) are told the same way, and read on the board.
registerDawnLines('storyteller', storyDawnLines);
registerBoardPage({ id: 'tidings', title: 'Tidings', render: (state, townId) => ({ lines: tidings(state, townId) }) });
