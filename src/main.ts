import './style.css';
import { initBudget } from './ui/budget';
import { initDefinition } from './ui/definition';
import { initDeployments } from './ui/deployments';
import { initDial } from './ui/dial';
import { initGuess } from './ui/guess';
import { initLeak } from './ui/leak';
import { initPredictions } from './ui/predict';

initPredictions();
initLeak();
initDefinition();
initGuess();
initDial();
initBudget();
initDeployments();
