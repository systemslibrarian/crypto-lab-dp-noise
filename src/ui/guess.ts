/**
 * Exhibit 3 — break it yourself: try to tell the two worlds apart.
 *
 * Exhibit 2 draws the guarantee. This one makes you feel it. The sampler runs
 * for real — thousands of exact discrete-Laplace draws from each of the two
 * neighbouring databases, accumulated across animation frames so the histograms
 * build in front of you rather than appearing finished. Then the game: the page
 * flips a cryptographic coin, releases one answer from the world it picked, and
 * asks you which one it was.
 *
 * The tally is the point. At ε = 5 you will be right nearly every time. At
 * ε = 0.1 you will hover at a coin flip no matter how carefully you play, and
 * the theoretical ceiling printed beside your score says you cannot do better —
 * that ceiling is a *theorem about every possible attacker*, not a claim about
 * your attention span.
 */
import { countHighEarners, EMPLOYEES, TARGET_ID, without } from '../dp/database';
import { discreteLaplacePmf } from '../dp/discrete';
import { optimalGuessRate, type CurveSpec } from '../dp/guarantee';
import { release, type MechanismSpec } from '../dp/mechanism';
import { epsAt, EPS_DEFAULT_INDEX, EPS_LADDER } from '../dp/params';
import { toNumber } from '../dp/rational';
import { uniformBelow } from '../dp/rng';
import { chart, chartData, legend, type Series } from './chart';
import { byId, chunked, clear, el, layered, num, pct, stat, statRow, verdict } from './dom';
import { quote } from './ledger';
import { bindEpsSlider } from './link';
import { randomnessNote, sharedRng } from './random';

const rng = sharedRng();
const SAMPLES = 2_000;

const WITH_ALICE = countHighEarners.run(EMPLOYEES);
const WITHOUT_ALICE = countHighEarners.run(without(EMPLOYEES, TARGET_ID));

const specFor = (epsIndex: number): MechanismSpec => ({
  kind: 'discrete-laplace',
  eps: epsAt(epsIndex),
  delta: 0,
  sensitivity: countHighEarners.sensitivity,
  gridSteps: 1,
});

const curveFor = (eps: number): CurveSpec => ({
  kind: 'laplace',
  param: eps,
  centre: WITH_ALICE,
  shift: WITH_ALICE - WITHOUT_ALICE,
  eps,
  lo: WITH_ALICE - Math.ceil(40 / eps) - 10,
  hi: WITH_ALICE + Math.ceil(40 / eps) + 10,
});

interface GameState {
  dealt: number | null;
  dealtWorld: 'with' | 'without' | null;
  right: number;
  played: number;
}

export function initGuess(): void {
  const slider = byId<HTMLInputElement>('guess-eps');
  slider.max = String(EPS_LADDER.length - 1);
  slider.value = String(EPS_DEFAULT_INDEX);

  const state: GameState = { dealt: null, dealtWorld: null, right: 0, played: 0 };

  const epsNow = (): number => toNumber(epsAt(Number(slider.value)));

  const resetGame = (): void => {
    state.dealt = null;
    state.dealtWorld = null;
    state.right = 0;
    state.played = 0;
    setGuessEnabled(false);
    renderGame(state, epsNow());
  };

  // Changing ε changes what "the best possible score" means, so a tally
  // accumulated at the old ε would be a comparison against the wrong ceiling.
  bindEpsSlider(slider, 'guess-eps-value', () => {
    renderTheory(epsNow());
    resetGame();
  });

  byId('guess-sample').addEventListener('click', () => runSampling(Number(slider.value)));
  byId('guess-reset').addEventListener('click', resetGame);

  byId('guess-deal').addEventListener('click', () => {
    // A cryptographic coin decides which world the release comes from, so the
    // page cannot be gamed by guessing what the page would have chosen.
    const inWorld = uniformBelow(rng, 2n) === 1n;
    state.dealtWorld = inWorld ? 'with' : 'without';
    state.dealt = release(rng, specFor(Number(slider.value)), inWorld ? WITH_ALICE : WITHOUT_ALICE).value;
    setGuessEnabled(true);
    renderGame(state, epsNow());
  });

  for (const [id, choice] of [
    ['guess-yes', 'with'],
    ['guess-no', 'without'],
  ] as const) {
    byId(id).addEventListener('click', () => {
      if (state.dealtWorld === null) return;
      state.played += 1;
      if (state.dealtWorld === choice) state.right += 1;
      const lastCorrect = state.dealtWorld === choice;
      const lastWorld = state.dealtWorld;
      const lastValue = state.dealt;
      state.dealt = null;
      state.dealtWorld = null;
      setGuessEnabled(false);
      renderGame(state, epsNow(), { lastCorrect, lastWorld, lastValue });
    });
  }

  renderTheory(epsNow());
  resetGame();
  renderSampleIdle();
}

function setGuessEnabled(on: boolean): void {
  for (const id of ['guess-yes', 'guess-no']) {
    byId<HTMLButtonElement>(id).disabled = !on;
  }
}

function renderTheory(eps: number): void {
  const half = Math.min(60, Math.max(6, Math.ceil(4 / eps)));
  byId('guess-theory').textContent =
    `At ε = ${eps}, the best any attacker can do from a single release is ` +
    `${pct(optimalGuessRate(curveFor(eps)))} — and the two distributions span roughly ±${half} around the true answer.`;
}

function renderSampleIdle(): void {
  const mount = byId('guess-chart');
  clear(mount);
  mount.append(
    verdict(
      'idle',
      'No samples drawn yet',
      `Draw ${num(SAMPLES)} real releases from each world and watch the two histograms land on top of each other — ` +
        'or not, depending on ε.',
    ),
  );
}

function runSampling(epsIndex: number): void {
  const button = byId<HTMLButtonElement>('guess-sample');
  button.disabled = true;
  const eps = toNumber(epsAt(epsIndex));
  const spec = specFor(epsIndex);
  const withCounts = new Map<number, number>();
  const withoutCounts = new Map<number, number>();
  const out = byId('guess-sample-out');
  clear(out);

  const bump = (m: Map<number, number>, v: number): void => {
    m.set(v, (m.get(v) ?? 0) + 1);
  };

  chunked(
    SAMPLES,
    120,
    (from, to) => {
      for (let i = from; i < to; i++) {
        bump(withCounts, release(rng, spec, WITH_ALICE).value);
        bump(withoutCounts, release(rng, spec, WITHOUT_ALICE).value);
      }
      renderSamples(eps, withCounts, withoutCounts, to);
    },
    () => {
      button.disabled = false;
      renderSampleSummary(eps, withCounts, withoutCounts);
    },
  );
}

function renderSamples(
  eps: number,
  withCounts: Map<number, number>,
  withoutCounts: Map<number, number>,
  drawn: number,
): void {
  const half = Math.min(45, Math.max(6, Math.ceil(4 / eps)));
  const lo = WITH_ALICE - half;
  const hi = WITH_ALICE + half;
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  const ta: [number, number][] = [];
  const tb: [number, number][] = [];
  for (let x = lo; x <= hi; x++) {
    a.push([x - 0.22, (withCounts.get(x) ?? 0) / drawn]);
    b.push([x + 0.22, (withoutCounts.get(x) ?? 0) / drawn]);
    ta.push([x, discreteLaplacePmf(eps, x - WITH_ALICE)]);
    tb.push([x, discreteLaplacePmf(eps, x - WITHOUT_ALICE)]);
  }

  const series: Series[] = [
    { id: 'sa', label: 'sampled, with Alice', kind: 'bars', style: 'a', points: a, width: 0.4 },
    { id: 'sb', label: 'sampled, without Alice', kind: 'bars', style: 'b', points: b, width: 0.4 },
    { id: 'ta', label: 'theory, with Alice', kind: 'steps', style: 'a', points: ta },
    { id: 'tb', label: 'theory, without Alice', kind: 'steps', style: 'b', points: tb },
  ];

  const mount = byId('guess-chart');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        `Histograms of ${drawn} sampled releases from each of the two databases, drawn as paired bars around each ` +
        `integer outcome, with the exact probabilities overlaid as staircases.`,
      xLabel: 'released answer',
      yLabel: 'share of draws',
      series,
      height: 260,
    }),
    legend([
      { label: `sampled — Alice in the database (${num(drawn)} draws)`, style: 'a', kind: 'bars' },
      { label: `sampled — Alice absent (${num(drawn)} draws)`, style: 'b', kind: 'bars' },
      { label: 'exact probability, with Alice', style: 'a', kind: 'steps' },
      { label: 'exact probability, without Alice', style: 'b', kind: 'steps' },
    ]),
    chartData({
      caption: `Sampled share of ${num(drawn)} draws from each world against the exact probability, per outcome.`,
      headers: [
        'Released answer',
        'Sampled, with Alice',
        'Exact, with Alice',
        'Sampled, without',
        'Exact, without',
      ],
      rows: ta
        .map(([x, p], i) => [x, a[i][1], p, b[i][1], tb[i][1]] as const)
        .filter(([, sa, pa, sb, pb]) => sa > 0 || sb > 0 || pa > 1e-4 || pb > 1e-4)
        .slice(0, 60)
        .map(([x, sa, pa, sb, pb]) => [
          String(x),
          sa.toFixed(4),
          pa.toFixed(4),
          sb.toFixed(4),
          pb.toFixed(4),
        ]),
      trend:
        `Both sampled columns track their exact counterparts to within sampling error, and the two worlds' columns ` +
        `differ from each other by roughly one outcome's worth of shift.`,
      notice:
        `Compare a sampled column against its exact column first — that is the check that the sampler is the ` +
        `mechanism it claims to be. Then compare the two worlds against each other: at small ε you will not find a ` +
        `row where one world is clearly the source, which is the guarantee, felt rather than quoted.`,
      sampled:
        `The two "sampled" columns are ${num(drawn)} real draws each from the exact discrete-Laplace sampler, so they ` +
        `carry sampling error and will differ on every run. The two "exact" columns are the closed-form PMF and do ` +
        `not vary. Agreement between them is evidence the implementation is right; it is not a proof of the ` +
        `definition, which is a statement about every possible output rather than the ones drawn here.`,
    }),
  );
}

function renderSampleSummary(
  eps: number,
  withCounts: Map<number, number>,
  withoutCounts: Map<number, number>,
): void {
  // Total variation distance, measured off the two histograms. The optimal
  // guesser's accuracy is (1 + TV)/2, so this is the same number the game
  // below converges to — measured, then compared with the theory.
  const keys = new Set([...withCounts.keys(), ...withoutCounts.keys()]);
  let tv = 0;
  for (const k of keys) {
    tv += Math.abs((withCounts.get(k) ?? 0) - (withoutCounts.get(k) ?? 0)) / SAMPLES;
  }
  const measured = (1 + tv / 2) / 2;
  const theory = optimalGuessRate(curveFor(eps));

  const out = byId('guess-sample-out');
  clear(out);
  out.append(
    statRow(
      [
        stat('Draws', `${num(SAMPLES)} × 2`, 'exact discrete Laplace'),
        stat('Measured best guess rate', pct(measured), 'from the two histograms'),
        stat('Predicted', pct(theory), '(1 + total variation)/2'),
      ],
      'Sampled versus predicted distinguishability',
    ),
    layered(
      Math.abs(measured - theory) < 0.03 ? 'ok' : 'warn',
      `Sampled and predicted agree to ${pct(Math.abs(measured - theory), 2)}`,
      {
        observation:
          `Measuring the best possible guess rate off the two histograms gives ${pct(measured)}; the closed form ` +
          `predicts ${pct(theory)}.`,
        meaning:
          'Two independent routes to the same number: the histograms came from the exact sampler the rest of the ' +
          'page uses, the prediction from the mechanism’s own PMF. Agreement is the check worth making, because a ' +
          'sampler that quietly disagreed with its own distribution would break the privacy claim without breaking ' +
          'anything visible.',
        details: [
          'The measured figure is (1 + TV)/2 where TV is the total variation distance read off the two histograms, ' +
            'and the predicted one is the same quantity computed from the closed-form PMF. For the discrete Laplace ' +
            'the exact value is (1 + tanh(ε/2))/2, which is also exactly e^ε/(1 + e^ε) — the belief bound. The suite ' +
            'asserts that equality at every stop on the ε ladder.',
          'A finite sample can only ever be evidence. Two thousand draws per world pins the measured rate to roughly ' +
            'a percentage point, so a disagreement smaller than that says nothing either way, and this panel is not ' +
            'a test of whether the mechanism is differentially private — it is a test of whether this implementation ' +
            'samples the distribution it says it does.',
          randomnessNote(),
        ],
      },
    ),
  );
}

function renderGame(
  state: GameState,
  eps: number,
  last?: { lastCorrect: boolean; lastWorld: 'with' | 'without'; lastValue: number | null },
): void {
  const out = byId('guess-out');
  const theory = optimalGuessRate(curveFor(eps));
  clear(out);

  if (state.dealt !== null) {
    out.append(
      el('p', { class: 'deal' }, [
        el('span', { class: 'deal__label', text: 'The mechanism released' }),
        el('span', { class: 'deal__value mono', text: String(state.dealt) }),
      ]),
      el('p', { class: 'muted', text: 'Which database did it come from?' }),
    );
  } else if (last) {
    out.append(
      verdict(
        last.lastCorrect ? 'ok' : 'bad',
        last.lastCorrect ? 'Right' : 'Wrong',
        `The release was ${last.lastValue}, drawn from the database ${
          last.lastWorld === 'with' ? 'containing Alice (true answer 6)' : 'without her (true answer 5)'
        }.`,
      ),
    );
  } else {
    out.append(verdict('idle', 'Deal a release to start', 'A cryptographic coin picks the world; you pick the answer.'));
  }

  const rate = state.played ? state.right / state.played : 0;
  out.append(
    statRow(
      [
        stat('Your score', `${state.right} / ${state.played}`, state.played ? pct(rate) : 'no rounds yet'),
        stat('Best possible', pct(theory), `at ε = ${eps}`),
        stat('Pure guessing', '50.0%', 'the floor'),
        // Every deal is a genuine release of the counting query, and a panel
        // that dealt hundreds of them without ever naming a price would be
        // teaching the exact habit Exhibit 5 exists to break.
        stat('Released so far', String(state.dealt !== null ? state.played + 1 : state.played), 'each deal is a real release'),
      ],
      'Your accuracy against the theoretical ceiling',
    ),
  );

  const dealtCount = state.dealt !== null ? state.played + 1 : state.played;
  if (dealtCount > 0) {
    const spent = dealtCount * eps;
    const cost = quote(eps, 'Guessing game deal');
    out.append(
      el('p', { class: 'note' }, [
        el('strong', { text: 'What this game has cost. ' }),
        document.createTextNode(
          `${dealtCount} ${dealtCount === 1 ? 'deal' : 'deals'} at ε = ${eps} is ε = ${num(spent, 2)} by basic ` +
            `composition — every one was a real release of the counting query, drawn by the real mechanism. Against ` +
            `the session ledger in Exhibit 5, one more would take the total to ${num(cost.total, 3)} of ` +
            `${num(cost.budget, 2)}${cost.wouldRefuse ? ', which is over budget and would be refused' : ''}. The game ` +
            `quotes rather than charges, because being locked out of a teaching panel would teach nothing; a real ` +
            `system does not have that luxury.`,
        ),
      ]),
    );
  }

  if (state.played >= 10) {
    const overshoot = rate - theory;
    out.append(
      verdict(
        overshoot > 0.12 ? 'warn' : 'ok',
        overshoot > 0.12
          ? `You are ahead of the ceiling — over ${state.played} rounds, that is luck`
          : `Your ${pct(rate)} sits where the theory says it must`,
        overshoot > 0.12
          ? `The bound is on the *expected* rate, so a short run can beat it the way a fair coin can land heads eight ` +
            `times. Keep going and it will come back to ${pct(theory)}.`
          : `The ceiling of ${pct(theory)} is not a statement about how hard you are trying. It is the accuracy of the ` +
            `optimal attacker — one who knows the mechanism, the true answers, and the exact distribution — and you ` +
            `cannot be beaten by very much.`,
      ),
    );
  }
}
