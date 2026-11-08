import { createApp } from './app/shell';
import { runTitleFlow } from './ui';

// Title first; the play scene starts when the player begins or loads a world.
runTitleFlow(createApp());
