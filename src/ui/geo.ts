import {
  auditFiniteGrid,
  geoBound,
  inferCandidatePath,
  nearestPointIndex,
  pathTranscriptBound,
  planarDensity,
  planarPrivacyLoss,
  planarRadialCdf,
  planarRadiusQuantile,
  samplePlanarLaplace,
  squareGrid,
  tightPlanarWitness,
  type Point,
} from '../dp/geo';
import { byId, clear, el, layered, num, pct, scroller, stat, statRow, verdict } from './dom';
import { randomnessNote, sharedRng } from './random';
import { subscribe } from './state';

const UTILITY_DRAWS = 2_000;
const ORIGIN: Point = { x: 0, y: 0 };
const SERVICES: readonly Point[] = [
  ORIGIN,
  { x: 8, y: 0 },
  { x: 0, y: 8 },
  { x: -8, y: 0 },
  { x: 0, y: -8 },
];

interface Config {
  readonly epsilon: number;
  readonly distanceKm: number;
  readonly releases: number;
}

function parseConfig(): Config {
  const epsilon = Number(byId<HTMLInputElement>('geo-eps').value);
  const distanceKm = Number(byId<HTMLInputElement>('geo-distance').value);
  const releases = Number(byId<HTMLInputElement>('geo-releases').value);
  if (!Number.isFinite(epsilon) || epsilon < 0.05 || epsilon > 2) {
    throw new RangeError('ε must be between 0.05 and 2 per kilometre.');
  }
  if (!Number.isFinite(distanceKm) || distanceKm < 0.25 || distanceKm > 10) {
    throw new RangeError('Location separation must be between 0.25 and 10 kilometres.');
  }
  if (!Number.isInteger(releases) || releases < 1 || releases > 12) {
    throw new RangeError('Repeated releases must be a whole number from 1 to 12.');
  }
  return { epsilon, distanceKm, releases };
}

function dataStat(label: string, value: string, raw: number, id: string, note?: string): HTMLElement {
  const node = stat(label, value, note);
  node.id = id;
  node.dataset.value = String(raw);
  return node;
}

function idleOutputs(): void {
  clear(byId('geo-sample-out'));
  byId('geo-sample-out').append(
    verdict('idle', 'No planar samples drawn yet', 'Changing ε retires sampled utility; run the mechanism again.'),
  );
  clear(byId('geo-path-out'));
  byId('geo-path-out').append(
    verdict('idle', 'No release transcript yet', 'The attacker has no outputs from which to compare the two paths.'),
  );
}

function invalid(message: string): void {
  for (const id of ['geo-bound-out', 'geo-grid-out']) {
    clear(byId(id));
    byId(id).append(verdict('bad', 'Configuration refused', message));
  }
  byId<HTMLButtonElement>('geo-sample').disabled = true;
  byId<HTMLButtonElement>('geo-path').disabled = true;
  idleOutputs();
}

function renderExactClaims(config: Config): void {
  const a = ORIGIN;
  const b = { x: config.distanceKm, y: 0 };
  const witness = tightPlanarWitness(a, b);
  const loss = planarPrivacyLoss(config.epsilon, a, b, witness);
  const bound = geoBound(config.epsilon, a, b);
  const ratioFromDensities = planarDensity(config.epsilon, a, witness) /
    planarDensity(config.epsilon, b, witness);
  const ratioFromLoss = Math.exp(loss);
  const ratioAgrees =
    Math.abs(ratioFromDensities - ratioFromLoss) <= 1e-12 * Math.max(1, Math.abs(ratioFromLoss));
  const checked = Math.abs(loss) <= bound + 1e-12 && ratioAgrees;

  const mount = byId('geo-bound-out');
  clear(mount);
  mount.append(
    statRow(
      [
        dataStat('Input separation', `${num(config.distanceKm, 2)} km`, config.distanceKm, 'geo-separation-stat'),
        dataStat('Computed log ratio', num(loss, 4), loss, 'geo-loss-stat', 'log p(z|A) / p(z|B)'),
        dataStat('ε × distance', num(bound, 4), bound, 'geo-bound-stat', 'the metric-DP bound'),
        dataStat('Density ratio', num(ratioFromDensities, 4), ratioFromDensities, 'geo-ratio-stat'),
      ],
      'Exact geo-indistinguishability comparison',
    ),
    layered(checked ? 'ok' : 'bad', checked ? 'The metric bound is met — tightly' : 'The metric bound failed', {
      observation:
        `For A = (0, 0), B = (${num(config.distanceKm, 2)}, 0) and the collinear output ` +
        `z = (${num(witness.x, 2)}, ${num(witness.y, 2)}), the mechanism computes log(p(z|A)/p(z|B)) = ${num(loss, 4)}.`,
      meaning:
        `The bound is εd(A,B) = ${num(bound, 4)}. Here equality is deliberate: the output lies beyond A on the line through both inputs, where the triangle inequality is tight.`,
      details: [
        `The density ratio above is recomputed from the two normalised densities, while the log ratio is computed from distances. Agreement gives two routes to the displayed claim. ε carries units km⁻¹; ε without its metric and unit is incomplete.`,
      ],
      detailsLabel: 'Why equality holds — and why ε needs a unit',
    }),
  );

  renderGrid(config.epsilon);
}

function renderGrid(epsilon: number): void {
  const grid = squareGrid(3);
  const borderA = { x: -3, y: 0 };
  const borderB = { x: -2, y: 0 };
  const requestedBound = geoBound(epsilon, borderA, borderB);
  const naive = auditFiniteGrid(epsilon, borderA, borderB, grid);
  const repaired = auditFiniteGrid(epsilon / 2, borderA, borderB, grid);

  const table = el('table', { class: 'data-table' }, [
    el('caption', {
      text: 'Computed over every output cell of a 7 × 7 grid; inputs are adjacent border cells one kilometre apart.',
    }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Finite-grid rule' }),
        el('th', { scope: 'col', text: 'Largest |log ratio|' }),
        el('th', { scope: 'col', text: 'Required bound' }),
        el('th', { scope: 'col', text: 'Outcome' }),
      ]),
    ]),
    el('tbody', {}, [
      gridRow('Naive rate ε', naive.maxAbsLogRatio, requestedBound, false, 'geo-grid-naive'),
      gridRow('Half-rate ε/2 control', repaired.maxAbsLogRatio, requestedBound, true, 'geo-grid-repaired'),
    ]),
  ]);

  const mount = byId('geo-grid-out');
  clear(mount);
  mount.append(
    scroller('Finite-grid boundary comparison', table),
    layered(
      naive.maxAbsLogRatio > requestedBound && repaired.maxAbsLogRatio <= requestedBound + 1e-12 ? 'warn' : 'bad',
      'Cropping and renormalising are not invisible details',
      {
        observation:
          `The naive shortcut reaches ${num(naive.maxAbsLogRatio, 4)} at output ` +
          `(${num(naive.witness.x)}, ${num(naive.witness.y)}), above the requested ${num(requestedBound, 4)} bound. ` +
          `The half-rate control reaches ${num(repaired.maxAbsLogRatio, 4)}.`,
        meaning:
          'Every input has a different normalising constant near the border. At rate ε there are two distance-sized terms; using ε/2 bounds their sum by εd. This is a separate finite-grid teaching construction, not the paper’s digital planar mechanism.',
        details: [
          'The paper handles finite precision by calibrating an adjusted privacy parameter and then mapping to a fixed admissible set. This demo does not implement that calibration and does not transfer its theorem to JavaScript numbers.',
          'Applying a deterministic projection after an ideal private draw is post-processing in the ideal mathematical model. Directly defining and renormalising a new distribution on a cropped grid is a different mechanism, which is what this control tests.',
        ],
        detailsLabel: 'Finite precision, projection and the separate grid model',
      },
    ),
  );
}

function gridRow(
  label: string,
  measured: number,
  bound: number,
  expectedPass: boolean,
  id: string,
): HTMLElement {
  const passes = measured <= bound + 1e-12;
  const row = el('tr', { id, 'data-value': measured, 'data-bound': bound }, [
    el('th', { scope: 'row', text: label }),
    el('td', { class: 'numeric', text: num(measured, 4) }),
    el('td', { class: 'numeric', text: num(bound, 4) }),
    el('td', { text: passes ? 'within bound' : 'violates bound' }),
  ]);
  if (passes !== expectedPass) row.classList.add('row--leak');
  return row;
}

function runUtility(): void {
  let config: Config;
  try {
    config = parseConfig();
  } catch (error) {
    invalid(error instanceof Error ? error.message : String(error));
    return;
  }
  const rng = sharedRng();
  let radialSum = 0;
  let withinTwo = 0;
  let nearestCorrect = 0;
  for (let i = 0; i < UTILITY_DRAWS; i++) {
    const draw = samplePlanarLaplace(config.epsilon, ORIGIN, rng);
    radialSum += draw.radius;
    if (draw.radius <= 2) withinTwo += 1;
    if (nearestPointIndex(draw.point, SERVICES) === 0) nearestCorrect += 1;
  }
  const sampledMean = radialSum / UTILITY_DRAWS;
  const analyticMean = 2 / config.epsilon;
  const sampledWithin = withinTwo / UTILITY_DRAWS;
  const analyticWithin = planarRadialCdf(config.epsilon, 2);
  const radius90 = planarRadiusQuantile(config.epsilon, 0.9);

  const mount = byId('geo-sample-out');
  clear(mount);
  mount.append(
    statRow(
      [
        dataStat('Sample mean error', `${num(sampledMean, 3)} km`, sampledMean, 'geo-sample-mean'),
        dataStat('Analytic mean', `${num(analyticMean, 3)} km`, analyticMean, 'geo-analytic-mean', '2/ε'),
        dataStat('Within 2 km', pct(sampledWithin, 1), sampledWithin, 'geo-sample-within'),
        dataStat('Exact P[R ≤ 2 km]', pct(analyticWithin, 1), analyticWithin, 'geo-analytic-within'),
        dataStat('90% error radius', `${num(radius90, 3)} km`, radius90, 'geo-radius-90'),
        dataStat('Nearest service retained', pct(nearestCorrect / UTILITY_DRAWS, 1), nearestCorrect / UTILITY_DRAWS, 'geo-nearest'),
      ],
      'Current planar sample and analytic utility',
    ),
    layered('ok', `${UTILITY_DRAWS.toLocaleString('en-US')} planar draws measured`, {
      observation:
        `The current run has mean radial error ${num(sampledMean, 3)} km; the distribution’s analytic mean is ${num(analyticMean, 3)} km. ` +
        `${nearestCorrect.toLocaleString('en-US')} draws still select the service at the true location from five services eight kilometres apart.`,
      meaning:
        'Privacy and utility share the same ε: lowering ε tightens the per-kilometre privacy loss and spreads the released location farther.',
      details: [
        randomnessNote(),
        'The angle is uniform and the radius is Gamma(shape 2, scale 1/ε). Sampling independent one-dimensional Laplace noise for x and y would produce a different, diamond-shaped distribution and is not this mechanism.',
        'These draws use 53-bit IEEE-754 uniforms. They exercise the stated ideal density but are not an exact discrete sampler or the paper’s finite-precision construction.',
      ],
      detailsLabel: 'Sampler, randomness and implementation boundary',
    }),
  );
}

function runPathTranscript(): void {
  let config: Config;
  try {
    config = parseConfig();
  } catch (error) {
    invalid(error instanceof Error ? error.message : String(error));
    return;
  }
  const pathA = Array.from({ length: config.releases }, (_, i) => ({ x: i * 0.75, y: 0 }));
  const pathB = pathA.map((point) => ({ x: point.x, y: config.distanceKm }));
  const rng = sharedRng();
  const releases = pathA.map((point) => samplePlanarLaplace(config.epsilon, point, rng).point);
  const inferred = inferCandidatePath(config.epsilon, pathA, pathB, releases);
  const bound = pathTranscriptBound(config.epsilon, pathA, pathB);

  const body = el('tbody');
  releases.forEach((release, i) => {
    body.append(
      el('tr', {}, [
        el('th', { scope: 'row', text: String(i + 1) }),
        el('td', { class: 'numeric', text: num(release.x, 3) }),
        el('td', { class: 'numeric', text: num(release.y, 3) }),
        el('td', {
          class: 'numeric',
          text: num(planarPrivacyLoss(config.epsilon, pathA[i]!, pathB[i]!, release), 4),
        }),
      ]),
    );
  });
  const table = el('table', { class: 'data-table' }, [
    el('caption', { text: 'Attacker-visible release transcript; candidate paths A and B are public.' }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: 'Release' }),
        el('th', { scope: 'col', text: 'x (km)' }),
        el('th', { scope: 'col', text: 'y (km)' }),
        el('th', { scope: 'col', text: 'log Lᵢ(A/B)' }),
      ]),
    ]),
    body,
  ]);
  const within = Math.abs(inferred.logLikelihoodAOverB) <= bound + 1e-10;
  const favoured = inferred.favoured === 'tie' ? 'neither path' : `path ${inferred.favoured}`;

  const mount = byId('geo-path-out');
  clear(mount);
  mount.append(
    statRow(
      [
        dataStat('Transcript releases', String(config.releases), config.releases, 'geo-path-count'),
        dataStat('log L(A/B)', num(inferred.logLikelihoodAOverB, 4), inferred.logLikelihoodAOverB, 'geo-path-loss'),
        dataStat('Composed bound', num(bound, 4), bound, 'geo-path-bound', 'Σ εd at every release'),
        dataStat('Favoured-path posterior', pct(inferred.posteriorFavoured, 1), inferred.posteriorFavoured, 'geo-path-posterior', 'equal prior over A and B'),
      ],
      'Repeated-release likelihood accounting',
    ),
    scroller('Attacker-visible path release transcript', table),
    layered(within ? 'warn' : 'bad', within ? `The transcript favours ${favoured}, within its composed bound` : 'The transcript exceeded its bound', {
      observation:
        `Using only the two public candidate paths and released points, the attacker computes log L(A/B) = ${num(inferred.logLikelihoodAOverB, 4)}. ` +
        `The teaching controller generated this run from path A; that retained truth is not an input to the inference function.`,
      meaning:
        `Each point has a bound, but ${config.releases} independent releases compose to ${num(bound, 4)}, not ${num(config.epsilon * config.distanceKm, 4)}. A point guarantee cannot silently be reused for a trajectory.`,
      details: [
        randomnessNote(),
        'This is a bounded two-candidate likelihood comparison, not a universal trajectory reconstruction attack. The paths are parallel and equally separated at every step; the observer sees the complete release transcript.',
        'The displayed posterior assumes the attacker assigned equal prior probability to candidate paths A and B. A different prior changes the posterior, but not the transcript likelihood ratio or its metric bound.',
        'Real paths are correlated. The original paper explains that independent per-point protection can become ineffective across long or correlated traces and that a useful path model needs assumptions about possible locations and correlations. This panel makes composition visible; it does not solve that modelling problem.',
      ],
      detailsLabel: 'Observer view, correlation and what this transcript does not establish',
    }),
  );
}

function refresh(): void {
  try {
    const config = parseConfig();
    byId<HTMLButtonElement>('geo-sample').disabled = false;
    byId<HTMLButtonElement>('geo-path').disabled = false;
    renderExactClaims(config);
    idleOutputs();
  } catch (error) {
    invalid(error instanceof Error ? error.message : String(error));
  }
}

export function initGeo(): void {
  for (const id of ['geo-eps', 'geo-distance', 'geo-releases']) {
    byId<HTMLInputElement>(id).addEventListener('input', refresh);
  }
  byId<HTMLButtonElement>('geo-sample').addEventListener('click', runUtility);
  byId<HTMLButtonElement>('geo-path').addEventListener('click', runPathTranscript);
  subscribe((next, prev) => {
    if (next.seeded !== prev.seeded) idleOutputs();
  });
  refresh();
}
