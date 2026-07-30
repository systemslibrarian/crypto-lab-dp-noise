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
import { advancedComposition, basicComposition, Ledger, type Spend } from '../dp/composition';
import { EMPLOYEES, queryById, sumSalary } from '../dp/database';
import { laplaceScale, release, type MechanismSpec } from '../dp/mechanism';
import { epsAt, EPS_LADDER } from '../dp/params';
import { cryptoRng } from '../dp/rng';
import { chart, legend } from './chart';
import { byId, chunked, clear, compactMoney, el, money, num, scroller, stat, statRow, verdict } from './dom';

const rng = cryptoRng();
const DELTA_PRIME = 1e-6;

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

let ledger = new Ledger(1.5, DELTA_PRIME);
const answers: { label: string; value: string; eps: number }[] = [];

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
    ledger = new Ledger(Number(budgetSelect.value), DELTA_PRIME);
    answers.length = 0;
    renderLedger();
  });

  for (const a of ASKABLE) {
    byId(a.id).addEventListener('click', () => ask(a));
  }
  byId('bud-reset').addEventListener('click', () => {
    ledger.reset();
    answers.length = 0;
    renderLedger();
  });

  renderLedger();
  renderCompositionCurve();
  wireAveraging();
}

function ask(a: Askable): void {
  const q = queryById(a.queryId);
  const spend: Spend = { eps: Number(a.eps), delta: 0, label: a.label };
  const admitted = ledger.request(spend);
  const out = byId('bud-out');
  clear(out);

  if (!admitted) {
    const quoted = ledger.quote(spend);
    // Fail closed. No answer is produced, not even a noisier one.
    out.append(
      verdict(
        'bad',
        'Refused — the budget cannot cover this query',
        `Answering it would put the charged ε at ${num(quoted.eps, 3)}, past the budget of ${num(ledger.budget, 2)}. ` +
          `No answer was computed and nothing was released. This is the only fail-closed option available: a release ` +
          `cannot be taken back, so a mechanism that is out of budget has to stop answering, not answer more carefully. ` +
          `Reset the ledger, or raise the budget and accept what that means.`,
      ),
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
  const state = ledger.state();
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
      verdict(
        'bad',
        `The true payroll is recovered to within ${money(last.absError)}`,
        `Every one of those ${num(total)} answers was independently differentially private at ε = ${epsEach}. The set ` +
          `of them is not, because independent noise averages away at 1/√n. What the analyst walks away with is what ` +
          `matters, and by basic composition they have spent ε = ${num(last.epsSpent, 1)} — a number that describes ` +
          `essentially no privacy at all. This is the entire reason a budget must be charged and enforced, and why the ` +
          `ledger above refuses rather than negotiates.`,
      ),
    );
  }
}
