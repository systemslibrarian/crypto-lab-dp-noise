/**
 * Exhibit 2 — the definition itself, drawn.
 *
 * This is the headline mechanism of the page. Two worlds sit side by side: one
 * where Alice is in the database and one where she is not. The same query runs
 * in both. The first chart is the two output distributions; the second is the
 * log of their pointwise ratio drawn between rails at ±ε — the inequality that
 * *is* differential privacy, plotted rather than quoted.
 *
 * Everything on screen is computed from the exact PMF of the mechanism the
 * other exhibits sample from. Drag ε and both charts recompute: under Laplace
 * the ratio steps from one rail to the other and sits there, and under the
 * Gaussian it is a straight line through both, which is the whole reason δ
 * exists.
 */
import { countHighEarners, EMPLOYEES, TARGET_ID, without } from '../dp/database';
import { discreteGaussianPmf, discreteLaplacePmf } from '../dp/discrete';
import { analyticSigma } from '../dp/gaussian';
import { logRatio, optimalGuessRate, ratioCurve, type CurveSpec } from '../dp/guarantee';
import { worstCasePosterior } from '../dp/mechanism';
import { epsAt, EPS_DEFAULT_INDEX, EPS_LADDER } from '../dp/params';
import { toNumber } from '../dp/rational';
import { chart, chartData, legend, type Series } from './chart';
import { byId, clear, el, layered, num, pct, ratio, stat, statRow } from './dom';
import { bindEpsSlider } from './link';
import { complete } from './state';

const DELTA = 1e-5;

const WITH_ALICE = countHighEarners.run(EMPLOYEES);
const WITHOUT_ALICE = countHighEarners.run(without(EMPLOYEES, TARGET_ID));

export interface DefinitionView {
  readonly eps: number;
  readonly gaussian: boolean;
  readonly spec: CurveSpec;
  readonly sigma: number;
}

/** The exact PMF of whichever mechanism is selected, centred on `centre`. */
function pmfAt(view: DefinitionView, x: number, centre: number): number {
  return view.gaussian
    ? discreteGaussianPmf(view.sigma, x - centre)
    : discreteLaplacePmf(view.eps, x - centre);
}

export function initDefinition(): void {
  const slider = byId<HTMLInputElement>('def-eps');
  const mech = byId<HTMLSelectElement>('def-mech');
  slider.max = String(EPS_LADDER.length - 1);
  slider.value = String(EPS_DEFAULT_INDEX);
  /** The ε this exhibit opened at, so "the reader moved it" is a real event. */
  const startedAt = Number(slider.value);

  const render = (source: 'reader' | 'sync' = 'sync'): void => {
    const eps = toNumber(epsAt(Number(slider.value)));
    const gaussian = mech.value === 'gaussian';
    // Sensitivity is 1 here — one person changes a count by one — so σ and the
    // lattice step are the same thing, and the picture needs no rescaling.
    const sigma = gaussian ? analyticSigma(1, eps, DELTA) : 0;
    const half = gaussian
      ? Math.min(90, Math.max(8, Math.ceil(4.5 * sigma)))
      : Math.min(90, Math.max(8, Math.ceil(5 / eps)));
    const view: DefinitionView = {
      eps,
      gaussian,
      sigma,
      spec: {
        kind: gaussian ? 'gaussian' : 'laplace',
        param: gaussian ? sigma : eps,
        centre: WITH_ALICE,
        shift: WITH_ALICE - WITHOUT_ALICE,
        eps,
        // The bound is a claim about *every* output, so it is computed over a
        // range far wider than the one drawn — otherwise "the ceiling holds"
        // would only mean "the ceiling holds where we happened to look".
        lo: WITH_ALICE - (gaussian ? Math.ceil(14 * sigma) + 40 : half * 12 + 40),
        hi: WITH_ALICE + (gaussian ? Math.ceil(14 * sigma) + 40 : half * 12 + 40),
      },
    };

    renderDistributions(view, half);
    renderRatio(view, half);
    renderReadout(view);
    // Established by *this reader moving this ε* — not by the exhibit rendering
    // at its default, and not by a linked ε arriving from the dial. Linking
    // propagates the value; it does not propagate having understood it.
    //
    // The condition is exactly the action the navigator prints for this step.
    // Switching to the Gaussian is also real engagement with the exhibit, and
    // it deliberately does not count: a navigator that says "Do: move ε" and
    // then ticks itself off for something else has stopped meaning anything.
    if (source === 'reader' && Number(slider.value) !== startedAt) complete('definition');
  };

  // Owns the ε label and the shared-ε handshake; this module only draws.
  bindEpsSlider(slider, 'def-eps-value', render);
  mech.addEventListener('change', () => render('sync'));
  render();
}

function renderDistributions(view: DefinitionView, half: number): void {
  const lo = WITH_ALICE - half;
  const hi = WITH_ALICE + half;
  const a: [number, number][] = [];
  const b: [number, number][] = [];
  for (let x = lo; x <= hi; x++) {
    a.push([x, pmfAt(view, x, WITH_ALICE)]);
    b.push([x, pmfAt(view, x, WITHOUT_ALICE)]);
  }

  const series: Series[] = [
    { id: 'with', label: 'with Alice', kind: 'steps', style: 'a', points: a },
    { id: 'without', label: 'without Alice', kind: 'steps', style: 'b', points: b },
  ];

  const mount = byId('def-chart');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        `Two probability distributions over the released count, one for the database containing Alice and one ` +
        `for the database without her. At ε = ${view.eps} they overlap almost entirely.`,
      xLabel: 'released answer (true answers: 6 with Alice, 5 without)',
      yLabel: 'probability',
      series,
      markers: [
        { x: WITH_ALICE, label: 'truth: 6', style: 'a' },
        { x: WITHOUT_ALICE, label: 'truth: 5', style: 'b' },
      ],
    }),
    legend([
      { label: `Alice is in the database — true answer ${WITH_ALICE}`, style: 'a', kind: 'steps' },
      { label: `Alice is not — true answer ${WITHOUT_ALICE}`, style: 'b', kind: 'steps' },
    ]),
    chartData({
      caption: `Probability of each released answer under both databases, at ε = ${view.eps}.`,
      headers: ['Released answer', 'Pr with Alice', 'Pr without Alice', 'Difference'],
      rows: a
        .map(([x, p], i) => [x, p, b[i][1]] as const)
        .filter(([, p, q]) => p > 1e-6 || q > 1e-6)
        .slice(0, 60)
        .map(([x, p, q]) => [String(x), p.toExponential(3), q.toExponential(3), (p - q).toExponential(2)]),
      trend:
        `Two distributions of the same shape, offset by one — the single person’s worth of difference between the ` +
        `databases — each spreading further as ε falls.`,
      notice:
        `Compare the two probability columns row by row. The question the definition asks is not whether the curves ` +
        `look similar but whether any single row lets you tell them apart, and at ε = ${view.eps} the largest ` +
        `difference between them is ${Math.max(...a.map(([, p], i) => Math.abs(p - b[i][1]))).toExponential(2)}. ` +
        `The next chart turns that comparison into the ratio the definition actually bounds.`,
    }),
  );
}

function renderRatio(view: DefinitionView, half: number): void {
  const curve = ratioCurve(view.spec);
  const shown = curve.points.filter((p) => p.x >= WITH_ALICE - half && p.x <= WITH_ALICE + half);
  const mount = byId('def-ratio');
  clear(mount);

  // Plotted as a *signed log* ratio between ±ε rails. The plain ratio would lie
  // exactly on its own ceiling everywhere for the Laplace mechanism — correct,
  // and a picture of nothing. This one shows the step, the saturation, and the
  // Gaussian breaking straight through the rails.
  const logPoints: [number, number][] = shown.map((p) => [p.x, logRatio(view.spec, p.x)]);
  const bound = view.eps * 1.9;

  mount.append(
    chart({
      ariaLabel:
        `The natural log of the ratio between the two probabilities at each possible output, against the ±ε rails ` +
        `at ±${view.eps}. ` +
        (view.gaussian
          ? 'Under the Gaussian it is a straight line that crosses both rails and keeps going.'
          : 'Under the Laplace mechanism it is a step that saturates at the rails and never passes them.'),
      xLabel: 'released answer',
      yLabel: 'log likelihood ratio',
      yMin: -bound,
      yMax: bound,
      series: [{ id: 'ratio', label: 'log ratio', kind: 'line', style: 'a', points: logPoints }],
      ceilings: [
        { y: view.eps, label: `+ε = ${view.eps}` },
        { y: -view.eps, label: `−ε = −${view.eps}` },
      ],
      height: 220,
      yTickFormat: (v) => (v === 0 ? '0' : v.toFixed(Math.abs(v) < 1 ? 2 : 1)),
    }),
    legend([
      { label: 'ln(Pr with Alice ÷ Pr without Alice), at each output', style: 'a', kind: 'line' },
      { label: '±ε — the rails the definition promises', style: 'ceiling', kind: 'line' },
    ]),
  );

  const worst = shown.reduce((best, p) => (p.ratio > best.ratio ? p : best), shown[0]);
  mount.append(
    chartData({
      caption: 'Probability of each released answer under both databases, and the ratio between them.',
      headers: ['Released answer', 'Pr with Alice', 'Pr without Alice', 'Ratio', 'ln(ratio)'],
      rows: shown
        .filter((p) => p.withTarget > 1e-6 || p.withoutTarget > 1e-6)
        .slice(0, 60)
        .map((p) => [
          String(p.x),
          p.withTarget.toExponential(3),
          p.withoutTarget.toExponential(3),
          p.ratio.toFixed(4),
          logRatio(view.spec, p.x).toFixed(4),
        ]),
      trend: view.gaussian
        ? `The log-ratio column is a straight line in the released answer: it passes ε = ${view.eps} and keeps ` +
          `climbing, with no output at which it levels off.`
        : `The log-ratio column takes exactly two values away from the step — −${view.eps} below the shift and ` +
          `+${view.eps} above it — and never anything larger.`,
      notice: view.gaussian
        ? `Find the first row where the last column exceeds ${view.eps}. Everything from there outward is an output ` +
          `at which the ε promise is false, and δ = ${curve.deltaNeeded.toExponential(2)} is the total probability ` +
          `of landing in that region. That is what δ buys and all it buys.`
        : `Read the last column, not the shape. It saturates at ±${view.eps} and stays there, which is the ` +
          `definition being met with equality at every output — a tight ε rather than a merely respected one. The ` +
          `largest ratio anywhere in the examined range is ${ratio(curve.maxRatio)} against a ceiling of ` +
          `e^ε = ${ratio(curve.ceiling)}.`,
    }),
  );

  renderVerdict(view, curve, worst.x);
}

function renderVerdict(
  view: DefinitionView,
  curve: ReturnType<typeof ratioCurve>,
  worstX: number,
): void {
  const out = byId('def-guarantee');
  clear(out);
  if (!view.gaussian) {
    out.append(
      layered('ok', 'The rails hold — and they are tight', {
        observation:
          `The log-ratio steps from −ε to +ε and then stays flat, touching the rails at every output on the axis, ` +
          `including ${worstX}.`,
        meaning:
          `That flatness is the promise being met with equality rather than slack: the largest ratio anywhere is ` +
          `${ratio(curve.maxRatio)} against a ceiling of e^ε = ${ratio(curve.ceiling)}, so no output leaks more than ` +
          `ε allows and none leaks less than ε was paid for. ε bounds this ratio — it is not a quantity of noise.`,
        details: [
          `No δ is needed here, and the page computes that rather than asserting it: the total probability mass on ` +
            `outputs where the ε promise fails is ${curve.deltaNeeded.toExponential(1)}. Pure ε-DP means exactly ` +
            `this number is zero, and the discrete Laplace mechanism achieves it because its density falls off as a ` +
            `plain exponential in both directions, which is the one shape whose log-ratio saturates instead of growing.`,
          `The bound is checked far beyond the range drawn — over ${curve.points.length} outputs rather than the few ` +
            `dozen on screen — because "the ceiling holds" would otherwise only mean "the ceiling holds where we ` +
            `happened to look". It is still a computation over the outputs examined, not a proof of the theorem; the ` +
            `honest-scoping section says so.`,
        ],
      }),
    );
  } else {
    // σ is calibrated with Balle & Wang's closed form for the *continuous*
    // Gaussian, and the discrete sampler is then run at that σ. The two need not
    // agree exactly, and here they do not — so the page reports the gap and its
    // direction rather than claiming the target was met.
    const gap = curve.deltaNeeded / DELTA;
    const over = gap > 1;
    out.append(
      layered('warn', 'The rails do not hold — this is why δ exists', {
        observation:
          `The log-ratio is a straight line: it crosses +ε, keeps climbing, and would cross any rail you drew, ` +
          `reaching ${ratio(curve.maxRatio)} over the range examined.`,
        meaning:
          `A Gaussian tail falls faster than any exponential, so no pure ε can bound this ratio everywhere. The ` +
          `repair is (ε, δ): δ = ${curve.deltaNeeded.toExponential(2)} is the total probability of landing on an ` +
          `output where the ε promise is simply false — not a little extra privacy loss, but the mass where there is ` +
          `no promise at all.`,
        details: [
          `σ = ${num(view.sigma, 2)} was calibrated for δ = ${DELTA.toExponential(0)} using Balle & Wang's analytic ` +
            `Gaussian mechanism — but that closed form is for the *continuous* Gaussian, and the σ it returns is then ` +
            `handed to the discrete sampler. The two are close, not equal: the discrete mechanism here needs ` +
            `${pct(Math.abs(gap - 1), 1)} ${over ? 'more' : 'less'} δ than the calibration targeted. The page reports ` +
            `the gap and its direction rather than claiming the target was met.`,
          `Re-deriving the discrete Gaussian's own accounting is Canonne–Kamath–Steinke's job, not this page's. What ` +
            `the test suite does instead is a cross-check: the δ needed by the discrete PMF must agree with the ` +
            `continuous closed form to within 10%. That is evidence the calibration is not badly wrong, and it is not ` +
            `a re-derivation. The honest-scoping section lists it as such.`,
        ],
        detailsLabel: 'Why the details matter — the calibration gap, stated rather than smoothed over',
      }),
    );
  }
}

function renderReadout(view: DefinitionView): void {
  const guess = optimalGuessRate(view.spec);
  const posterior = worstCasePosterior(0.5, view.eps);
  const out = byId('def-out');
  clear(out);
  out.append(
    statRow(
      [
        stat('ε', String(view.eps), 'the privacy parameter'),
        stat('e^ε', ratio(Math.exp(view.eps)), 'the ratio ceiling'),
        view.gaussian
          ? stat('σ', num(view.sigma, 2), `calibrated for δ = ${DELTA.toExponential(0)}`)
          : stat('noise scale b', num(1 / view.eps, 2), 'Δ/ε, with Δ = 1'),
        stat('Best possible guess', pct(guess), 'from one release, even prior'),
        stat('Belief can move to', pct(posterior), 'from an even prior, worst case'),
      ],
      'The privacy parameters and what they mean for an attacker',
    ),
    el('p', {
      class: 'note',
      text:
        `Read the last two columns together. "Best possible guess" is what an optimal attacker achieves at ` +
        `distinguishing the two worlds from a single release — the page measures this against your own guesses in ` +
        `Exhibit 3. "Belief can move to" is the same fact from the other side: an observer who thought it was an even ` +
        `chance Alice was in the data cannot end up more than ${pct(posterior)} sure, whatever they see. That sentence ` +
        `is what ε actually buys.`,
    }),
  );
  if (!view.gaussian) {
    out.append(
      el('details', { class: 'data-details' }, [
        el('summary', { text: 'Those last two numbers are identical — why that is not a rendering slip' }),
        el('p', {
          text:
            'The total variation distance between two discrete Laplace distributions one step apart is exactly ' +
            'tanh(ε/2). An optimal attacker distinguishing two equally likely worlds succeeds with probability ' +
            '(1 + TV)/2, so their best rate is (1 + tanh(ε/2))/2 — which is algebraically identical to the belief ' +
            'bound e^ε/(1 + e^ε).',
        }),
        el('p', {
          text:
            'So this mechanism is tight in both senses at once: it attains the likelihood-ratio ceiling at every ' +
            'single output, and an optimal attacker collects the entire belief budget ε permits. Neither is true of ' +
            'the Gaussian, where the ratio is unbounded and the attacker does correspondingly better in the tails. ' +
            'The test suite asserts the equality at every stop on the ε ladder, so a change to either derivation ' +
            'that broke the correspondence would fail the build rather than quietly print two numbers that no ' +
            'longer mean the same thing.',
        }),
      ]),
    );
  }
}
