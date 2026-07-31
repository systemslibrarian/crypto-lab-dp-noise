import './style.css';
import { initBounds } from './ui/bounds';
import { initBudget } from './ui/budget';
import { initDefinition } from './ui/definition';
import { initDeployments } from './ui/deployments';
import { initDial } from './ui/dial';
import { initExit } from './ui/exit';
import { initGuess } from './ui/guess';
import { initLeak } from './ui/leak';
import { initLink } from './ui/link';
import { initObjectives } from './ui/objectives';
import { initPath } from './ui/path';
import { initPredictions } from './ui/predict';
import { initRandom } from './ui/random';
import { initTeaching } from './ui/teaching';

// Order matters in exactly two places. `initRandom` must be subscribed before
// anything can flip classroom mode, so the seeded stream is rewound before the
// first draw is taken from it. `initPath` must subscribe before `initLink`,
// because the navigator re-creates the readout's mount element on every render
// and the link module fills it — a subscriber that ran first would paint into a
// node that is about to be discarded.
initRandom();
initObjectives();
initPath();
initTeaching();
initPredictions();
initLeak();
initDefinition();
initGuess();
initDial();
initBounds();
initBudget();
initDeployments();
initExit();
initLink();
