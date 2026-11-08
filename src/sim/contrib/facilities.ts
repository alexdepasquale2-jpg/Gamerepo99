/** Facilities on the roads: the dawn word when one stops or starts again, and a noticeboard page of the works. */
import { registerBoardPage } from '../board-pages';
import { registerDawnLines } from '../dawn-lines';
import { facilityBoardLines, facilityDawnLines } from '../economy/facilities';

registerDawnLines('facilities', facilityDawnLines);

registerBoardPage({
  id: 'works',
  title: 'Road works',
  render: (s, townId, nameOf) => ({ lines: facilityBoardLines(s, townId, nameOf) }),
});
