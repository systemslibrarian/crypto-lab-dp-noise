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
import { epsAt, EPS_DEFAULT_INDEX, EPS_LADDER, epsLabel } from '../dp/params';
import { toNumber } from '../dp/rational';
import { chart, dataTable, legend, type Series } from './chart';
import { byId, clear, el, num, pct, ratio, stat, statRow, verdict } from './dom';

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

  const render = (): void => {
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

    byId('def-eps-value').textContent = epsLabel(Number(slider.value));
    renderDistributions(view, half);
    renderRatio(view, half);
    renderReadout(view);
  };

  slider.addEventListener('input', render);
  mech.addEventListener('change', render);
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
    dataTable(
      'The numbers behind these charts',
      'Probability of each released answer under both databases, and the ratio between them.',
      ['Released answer', 'Pr with Alice', 'Pr without Alice', 'Ratio'],
      shown
        .filter((p) => p.withTarget > 1e-6 || p.withoutTarget > 1e-6)
        .slice(0, 60)
        .map((p) => [
          String(p.x),
          p.withTarget.toExponential(3),
          p.withoutTarget.toExponential(3),
          p.ratio.toFixed(4),
        ]),
    ),
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
      verdict(
        'ok',
        `The rails hold — and they are tight`,
        `Across every output examined, the largest ratio is ${ratio(curve.maxRatio)}, against a ceiling of ` +
          `e^ε = ${ratio(curve.ceiling)}, and it is reached at every single output on the axis — including ${worstX}. ` +
          `Notice what the log-ratio does: it steps from −ε straight to +ε and then stays there, flat, forever. That ` +
          `flatness is the mechanism spending exactly the privacy it was budgeted at every possible answer and no ` +
          `more, which is what makes the Laplace mechanism the right shape for pure ε-DP. No δ is needed: the ` +
          `probability mass by which the promise is broken is ${curve.deltaNeeded.toExponential(1)}.`,
      ),
    );
  } else {
    // σ is calibrated with Balle & Wang's closed form for the *continuous*
    // Gaussian, and the discrete sampler is then run at that σ. The two need not
    // agree exactly, and here they do not — so the page reports the gap and its
    // direction rather than claiming the target was met.
    const gap = curve.deltaNeeded / DELTA;
    const over = gap > 1;
    out.append(
      verdict(
        'warn',
        'The rails do not hold — this is why δ exists',
        `The log-ratio is a straight line: it crosses +ε, keeps climbing, and would cross any rail you drew. A ` +
          `Gaussian tail falls faster than any exponential, so no pure ε can bound it — over the range examined the ` +
          `ratio reaches ${ratio(curve.maxRatio)}. The repair is (ε, δ): the total probability by which the promise ` +
          `is broken, summed over every output where it breaks, is ${curve.deltaNeeded.toExponential(2)}. ` +
          `σ = ${num(view.sigma, 2)} was calibrated for δ = ${DELTA.toExponential(0)} — but calibrated for the ` +
          `*continuous* Gaussian, using Balle & Wang's closed form, and then handed to the discrete sampler. The two ` +
          `are close, not equal: the discrete mechanism here needs ${pct(Math.abs(gap - 1), 1)} ${over ? 'more' : 'less'} ` +
          `δ than the calibration targeted. Re-deriving the discrete mechanism's own accounting is Canonne–Kamath–Steinke's ` +
          `job, not this page's, and the scoping section says so.`,
      ),
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
      el('p', {
        class: 'note',
        text:
          'Those last two numbers are identical, and that is not a rendering slip. The total variation distance ' +
          'between two discrete Laplace distributions one step apart is exactly tanh(ε/2), and (1 + tanh(ε/2))/2 is ' +
          'exactly e^ε/(1 + e^ε). So this mechanism is tight in both senses at once: it hits the likelihood-ratio ' +
          'ceiling at every output, and an optimal attacker collects the entire belief budget ε allows. The test ' +
          'suite asserts the equality at every stop on the ladder.',
      }),
    );
  }
}
