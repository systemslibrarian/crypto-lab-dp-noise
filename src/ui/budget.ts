/**
 * Exhibit 5 — composition: the budget, and what happens without one.
 *
 * Two panels that argue with each other. The ledger is the well-behaved world:
 * every query is charged, both composition rules are computed, the cheaper one
 * is billed, and a query that would overdraw the budget is *refused* rather than
 * answered. The averaging attack is what the ledger is defending against — ask
 * the same question enough times without being charged and the noise averages
 * away, taking the privacy with it.
 *
 * The refusal is the invariant, not a nicety. An over-budget release cannot be
 * un-released, so the only fail-closed behaviour is to not make it.
 */
import { averagingAttack } from '../dp/attack';
import { advancedComposition, basicComposition, type Spend } from '../dp/composition';
import { EMPLOYEES, queryById, sumSalary } from '../dp/database';
import { laplaceScale, release, type MechanismSpec } from '../dp/mechanism';
import { epsAt, EPS_LADDER } from '../dp/params';
import { chart, chartData, legend } from './chart';
import { byId, chunked, clear, compactMoney, el, layered, money, num, scroller, stat, statRow, verdict } from './dom';
import { charge, DELTA_PRIME, onLedgerChange, resetLedger, sessionLedger, setBudget } from './ledger';
import { randomnessNote, sharedRng } from './random';
import { complete } from './state';

const rng = sharedRng();

const GRID_STEPS: Record<string, number> = { 'count-high': 1, headcount: 1, 'sum-salary': 50 };

interface Askable {
  readonly id: string;
  readonly queryId: string;
  readonly eps: string;
  readonly label: string;
}

const ASKABLE: readonly Askable[] = [
  { id: 'ask-count', queryId: 'count-high', eps: '0.35', label: 'High earners' },
  { id: 'ask-head', queryId: 'headcount', eps: '0.2', label: 'Headcount' },
  { id: 'ask-sum', queryId: 'sum-salary', eps: '0.5', label: 'Total payroll' },
];

const answers: { label: string; value: string; eps: number }[] = [];

/**
 * Both halves of the budget lesson, tracked separately. The core idea is not
 * "averaging works" and not "the ledger refuses" — it is that the second exists
 * because of the first, so the step is only established once the reader has
 * seen both.
 */
const budgetLesson = { averaged: false, refused: false };

function noteBudgetProgress(): void {
  if (budgetLesson.averaged && budgetLesson.refused) complete('budget');
}

function specFor(queryId: string, epsText: string): MechanismSpec {
  const q = queryById(queryId);
  return {
    kind: 'discrete-laplace',
    eps: epsAt(EPS_LADDER.indexOf(epsText)),
    delta: 0,
    sensitivity: q.sensitivity,
    gridSteps: GRID_STEPS[queryId] ?? 1,
  };
}

export function initBudget(): void {
  const budgetSelect = byId<HTMLSelectElement>('bud-budget');
  budgetSelect.addEventListener('change', () => {
    setBudget(Number(budgetSelect.value));
    answers.length = 0;
    renderLedger();
  });

  for (const a of ASKABLE) {
    byId(a.id).addEventListener('click', () => ask(a));
  }
  byId('bud-reset').addEventListener('click', () => {
    resetLedger();
    answers.length = 0;
    renderLedger();
  });

  // The dial quotes this ledger, so a change made here has to reach it.
  onLedgerChange(renderLedger);

  renderLedger();
  renderCompositionCurve();
  wireAveraging();
}

function ask(a: Askable): void {
  const q = queryById(a.queryId);
  const ledger = sessionLedger();
  const spend: Spend = { eps: Number(a.eps), delta: 0, label: a.label };
  const admitted = charge(spend);
  const out = byId('bud-out');
  clear(out);

  if (!admitted) {
    const quoted = ledger.quote(spend);
    // Fail closed. No answer is produced, not even a noisier one.
    budgetLesson.refused = true;
    noteBudgetProgress();
    out.append(
      layered('bad', 'Refused — the budget cannot cover this query', {
        observation:
          `Answering would put the charged ε at ${num(quoted.eps, 3)}, past the budget of ${num(ledger.budget, 2)}, ` +
          `so no answer was computed and nothing was released.`,
        meaning:
          'This is the only fail-closed option available. A release cannot be taken back, so a mechanism that is out ' +
          'of budget has to stop answering — not answer more carefully, not answer with a warning attached. The ' +
          'refusal is the security control; the ledger above it is only the bookkeeping that makes the refusal possible.',
        details: [
          'Answering "more noisily instead" is the tempting alternative and it does not work. The budget is already ' +
            'spent; a further release adds further loss whatever its ε, and the composed total still exceeds what ' +
            'was promised. There is no noise level at which an over-budget answer becomes free.',
          'Reset the ledger, or raise the budget — but raising it is a decision about what you are promising people, ' +
            'not a way to get the answer you wanted. The ε at the top of this exhibit is the whole promise, and ' +
            'moving it after the fact is how deployments end up publishing a number they cannot defend.',
        ],
      }),
    );
    renderLedger();
    return;
  }

  const spec = specFor(a.queryId, a.eps);
  const value = release(rng, spec, q.run(EMPLOYEES)).value;
  answers.push({
    label: q.label,
    value: a.queryId === 'sum-salary' ? money(value) : num(value),
    eps: Number(a.eps),
  });
  out.append(
    verdict('ok', `Answered: ${a.queryId === 'sum-salary' ? money(value) : num(value)}`, `${q.label} Charged ε = ${a.eps}.`),
  );
  renderLedger();
}

function renderLedger(): void {
  const state = sessionLedger().state();
  const mount = byId('bud-ledger');
  clear(mount);

  const fraction = Math.min(1, state.charged.eps / state.budget);
  mount.append(
    statRow(
      [
        stat('Budget', num(state.budget, 2), 'total ε for this session'),
        stat('Charged', num(state.charged.eps, 3), `by ${state.charged.rule} composition`),
        stat('Remaining', num(state.remaining, 3), state.exhausted ? 'exhausted' : 'still spendable'),
        stat('Queries answered', String(state.spends.length)),
      ],
      'The privacy budget and what has been spent',
    ),
    el('div', { class: 'meter' }, [
      el('div', {
        class: `meter__fill${state.exhausted ? ' meter__fill--full' : ''}`,
        style: `width:${(fraction * 100).toFixed(1)}%`,
      }),
    ]),
    el('p', {
      class: 'meter__caption mono',
      text: `${num(state.charged.eps, 3)} / ${num(state.budget, 2)} spent${state.exhausted ? ' — exhausted' : ''}`,
    }),
  );

  if (state.spends.length) {
    mount.append(
      statRow(
        [
          stat('Basic composition', num(state.basic.eps, 3), 'ε simply adds'),
          stat(
            'Advanced composition',
            state.advanced ? num(state.advanced.eps, 3) : '—',
            `√(2 ln(1/δ′)·Σε²) + Σε(e^ε−1), δ′ = ${DELTA_PRIME.toExponential(0)}`,
          ),
          stat('Charged', num(state.charged.eps, 3), 'the cheaper of the two'),
        ],
        'Both composition rules, computed independently',
      ),
    );
  }

  const table = el('table', { class: 'data-table' }, [
    el('caption', { text: 'Every answer released this session, and what it cost.' }),
    el('thead', {}, [
      el('tr', {}, [
        el('th', { scope: 'col', text: '#' }),
        el('th', { scope: 'col', text: 'Query' }),
        el('th', { scope: 'col', text: 'Released' }),
        el('th', { scope: 'col', class: 'numeric', text: 'ε' }),
      ]),
    ]),
    el(
      'tbody',
      {},
      answers.length
        ? answers.map((a, i) =>
            el('tr', {}, [
              el('th', { scope: 'row', text: String(i + 1) }),
              el('td', { text: a.label }),
              el('td', { class: 'mono', text: a.value }),
              el('td', { class: 'numeric', text: a.eps.toFixed(2) }),
            ]),
          )
        : [
            el('tr', {}, [
              el('td', { colspan: '4', class: 'muted', text: 'Nothing released yet.' }),
            ]),
          ],
    ),
  ]);
  mount.append(scroller('Released answers this session', table));
}

function renderCompositionCurve(): void {
  // The two rules as functions of k, at a fixed per-query ε. Neither is simply
  // better: advanced composition pays a fixed √(2 ln(1/δ′)) toll up front and
  // only earns it back once k is large.
  const perQuery = 0.1;
  const basic: [number, number][] = [];
  const advanced: [number, number][] = [];
  let crossover: number | null = null;
  for (let k = 1; k <= 400; k++) {
    const s = Array.from({ length: k }, (_, i) => ({ eps: perQuery, delta: 0, label: `q${i}` }));
    const b = basicComposition(s).eps;
    const a = advancedComposition(s, DELTA_PRIME).eps;
    basic.push([k, b]);
    advanced.push([k, a]);
    if (crossover === null && a < b) crossover = k;
  }

  const mount = byId('bud-composition');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        `Total ε against the number of queries, at ε = ${perQuery} each, under basic and advanced composition. ` +
        `Basic is a straight line; advanced starts higher and grows as the square root, crossing at ${crossover} queries.`,
      xLabel: 'queries asked',
      yLabel: 'total ε charged',
      series: [
        { id: 'basic', label: 'basic', kind: 'line', style: 'a', points: basic },
        { id: 'adv', label: 'advanced', kind: 'line', style: 'b', points: advanced },
      ],
      markers: crossover ? [{ x: crossover, label: `crossover: ${crossover}`, style: 'ceiling' }] : [],
      height: 220,
    }),
    legend([
      { label: `basic composition — ε adds, k × ${perQuery}`, style: 'a', kind: 'line' },
      { label: 'advanced composition — √k, at the cost of a δ′', style: 'b', kind: 'line' },
      { label: 'where advanced starts winning', style: 'ceiling', kind: 'line' },
    ]),
    chartData({
      caption: `Total ε charged after k queries at ε = ${perQuery} each, under both composition rules.`,
      headers: ['Queries asked', 'Basic', 'Advanced', 'Cheaper rule'],
      rows: [1, 2, 5, 10, 20, 50, 100, 200, 400].map((k) => {
        const b = basic[k - 1][1];
        const a = advanced[k - 1][1];
        return [String(k), num(b, 3), num(a, 3), a < b ? 'advanced' : 'basic'];
      }),
      trend:
        `Basic grows linearly and advanced grows as √k from a higher starting point, so advanced is more expensive ` +
        `until k = ${crossover} and cheaper after it.`,
      notice:
        `Read the last column down the table. Neither rule is simply better, and the point at which they swap is a ` +
        `property of the per-query ε and the δ′ you are willing to accept — not a constant. A ledger that hard-coded ` +
        `either rule would overcharge in one regime and be invalid in the other, which is why the one above computes ` +
        `both on every request and bills the cheaper.`,
    }),
    el('p', {
      class: 'note',
      text:
        `Advanced composition is not free and not always better: below ${crossover} queries it charges more than simply ` +
        `adding, and it only applies at all if you are willing to accept an extra failure probability δ′ = ` +
        `${DELTA_PRIME.toExponential(0)}. The ledger above computes both every time and bills the cheaper one, which is ` +
        `what a real accountant does.`,
    }),
  );
}

function wireAveraging(): void {
  const slider = byId<HTMLInputElement>('avg-n');
  const button = byId<HTMLButtonElement>('avg-run');

  const label = (): void => {
    byId('avg-n-value').textContent = num(Number(slider.value));
  };
  slider.addEventListener('input', label);
  label();

  button.addEventListener('click', () => {
    button.disabled = true;
    const n = Number(slider.value);
    const epsEach = 0.5;
    const spec = specFor(sumSalary.id, '0.5');
    const trueValue = sumSalary.run(EMPLOYEES);
    const steps: { n: number; estimate: number; absError: number; epsSpent: number }[] = [];
    let sum = 0;
    let done = 0;

    const out = byId('avg-out');
    clear(out);

    chunked(
      n,
      100,
      (from, to) => {
        for (let i = from; i < to; i++) {
          sum += release(rng, spec, trueValue).value;
          done += 1;
          if (done === 1 || done === n || done % Math.max(1, Math.floor(n / 60)) === 0) {
            const estimate = sum / done;
            steps.push({
              n: done,
              estimate,
              absError: Math.abs(estimate - trueValue),
              epsSpent: done * epsEach,
            });
          }
        }
        renderAveraging(steps, trueValue, spec, epsEach, n, false);
      },
      () => {
        button.disabled = false;
        renderAveraging(steps, trueValue, spec, epsEach, n, true);
        budgetLesson.averaged = true;
        noteBudgetProgress();
      },
    );
  });

  const result = averagingAttack(rng, specFor(sumSalary.id, '0.5'), sumSalary.run(EMPLOYEES), 1, 0.5, 1);
  clear(byId('avg-out'));
  byId('avg-out').append(
    verdict(
      'idle',
      'Not run yet',
      `One release of the total payroll at ε = 0.5 comes back as ${money(result.steps[0].estimate)}, against a true ` +
        `${money(sumSalary.run(EMPLOYEES))}. Now ask the same question a few hundred more times.`,
    ),
  );
}

function renderAveraging(
  steps: readonly { n: number; estimate: number; absError: number; epsSpent: number }[],
  trueValue: number,
  spec: MechanismSpec,
  epsEach: number,
  total: number,
  finished: boolean,
): void {
  if (!steps.length) return;
  const b = laplaceScale(spec);
  const theory: [number, number][] = steps.map((s) => [s.n, (b * Math.SQRT2) / Math.sqrt(s.n)]);
  const last = steps[steps.length - 1];

  const mount = byId('avg-chart');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        'Absolute error of the running average against the number of queries asked, on logarithmic axes, next to the ' +
        'predicted 1/√n curve.',
      xLabel: 'queries asked',
      yLabel: 'error in the running average ($)',
      yLog: true,
      yMin: 100,
      series: [
        { id: 'err', label: 'measured', kind: 'line', style: 'a', points: steps.map((s) => [s.n, Math.max(100, s.absError)]) },
        { id: 'theory', label: 'predicted', kind: 'line', style: 'b', points: theory },
      ],
      height: 230,
      padLeft: 74,
      yTickFormat: (v) => compactMoney(v),
    }),
    legend([
      { label: 'how far the running average is from the truth', style: 'a', kind: 'line' },
      { label: 'the 1/√n the theory predicts (b√2/√n)', style: 'b', kind: 'line' },
    ]),
    chartData({
      caption: 'Error of the running average as queries accumulate, measured against the 1/√n prediction.',
      headers: ['Queries asked', 'Running average', 'Error', 'Predicted error', 'ε spent'],
      rows: steps
        .filter((_, i) => i % Math.max(1, Math.ceil(steps.length / 14)) === 0 || i === steps.length - 1)
        .map((s) => [
          num(s.n),
          money(s.estimate),
          money(s.absError),
          money((b * Math.SQRT2) / Math.sqrt(s.n)),
          num(s.epsSpent, 1),
        ]),
      trend:
        'The error column falls by roughly a factor of ten for every hundredfold increase in queries asked, tracking ' +
        'the predicted column, while the ε column rises linearly.',
      notice:
        'Read the error and the ε columns together. The attacker’s accuracy improves without bound while the privacy ' +
        'cost rises without bound, and nothing in the mechanism stops either — the only thing that ever stops it is a ' +
        'budget that refuses. That is the argument for composition accounting, stated as two columns.',
      sampled:
        `The "error" column is one real run of the exact sampler and will differ every time; the "predicted" column ` +
        `is the closed form b√2/√n with b = ${money(b)} and does not vary. Expect the measured column to wander ` +
        `around the prediction rather than sit on it — a single run that tracked the theory exactly would be the ` +
        `suspicious outcome.`,
    }),
  );

  const out = byId('avg-out');
  clear(out);
  out.append(
    statRow(
      [
        stat('Queries asked', num(last.n), `of ${num(total)}`),
        stat('Running average', money(last.estimate), `true value ${money(trueValue)}`),
        stat('Error', money(last.absError), `one answer alone: about ${money(b)}`),
        stat('ε spent', num(last.epsSpent, 1), `${epsEach} per query, basic composition`),
      ],
      'The averaging attack in progress',
    ),
  );

  if (finished) {
    out.append(
      layered('bad', `The true payroll is recovered to within ${money(last.absError)}`, {
        observation:
          `${num(total)} answers, each independently differentially private at ε = ${epsEach}, averaged to within ` +
          `${money(last.absError)} of the true total — against ${money(b)} of typical error on any one of them.`,
        meaning:
          `Privacy is a property of what the analyst walks away with, not of the last answer they were handed. ` +
          `Independent noise averages away at 1/√n, and by basic composition this transcript has spent ` +
          `ε = ${num(last.epsSpent, 1)} — a number that describes essentially no privacy at all. This is what the ` +
          `ledger exists to prevent, and why it refuses rather than negotiates.`,
        details: [
          `Nothing malfunctioned. Every release was a correct, valid ε = ${epsEach} mechanism, and an auditor ` +
            `checking any single one of them would find nothing wrong. The failure is entirely in the accounting ` +
            `around them, which is the part that has no visible symptom until someone runs this attack.`,
          `Laplace noise has finite variance, so the central limit theorem applies exactly as it would to anything ` +
            `else; heavy tails slow the convergence at small n and do not stop it. Nor does the discreteness of the ` +
            `sampler help — the lattice is far finer than the noise, so the average moves continuously.`,
          randomnessNote(),
        ],
      }),
    );
  }
}
