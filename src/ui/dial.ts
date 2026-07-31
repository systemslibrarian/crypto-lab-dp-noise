/**
 * Exhibit 4 — the dial: what ε costs in usefulness.
 *
 * The privacy/utility trade-off is the entire game, and it is a trade, not a
 * setting to be optimised. This panel puts the two sides of it on one screen:
 * pick a query, pick an ε, and read both what an attacker can conclude and how
 * wrong the answer is. The 95% interval and the typical error are computed from
 * the mechanism's own PMF, not from a formula quoted at you.
 *
 * It is also where sensitivity stops being an abstraction. Switch from the
 * headcount to the payroll total and the noise jumps by five orders of
 * magnitude at the same ε, because Δ went from 1 to 250,000. Same privacy,
 * wildly different answer — which is why "we use ε = 1" is not, on its own, a
 * statement about anything.
 */
import {
  countHighEarners,
  EMPLOYEES,
  headcount,
  meanFromReleases,
  QUERIES,
  queryById,
  sumSalary,
} from '../dp/database';
import { discreteGaussianPmf, discreteLaplacePmf } from '../dp/discrete';
import {
  gaussianSigma,
  lattice,
  laplaceScale,
  MECHANISM_LABELS,
  release,
  worstCasePosterior,
  type MechanismKind,
  type MechanismSpec,
} from '../dp/mechanism';
import { epsAt, EPS_DEFAULT_INDEX, EPS_LADDER } from '../dp/params';
import { toNumber } from '../dp/rational';
import { chart, chartData, legend } from './chart';
import { byId, clear, compactMoney, el, layered, money, num, pct, signed, stat, statRow, verdict } from './dom';
import { quote } from './ledger';
import { bindEpsSlider } from './link';
import { randomnessNote, sharedRng } from './random';
import { complete, update } from './state';

const rng = sharedRng();
const DELTA = 1e-5;

/** How many lattice steps the sensitivity spans, per query. */
const GRID_STEPS: Record<string, number> = { 'count-high': 1, headcount: 1, 'sum-salary': 50 };

function specFor(queryId: string, epsIndex: number, kind: MechanismKind): MechanismSpec {
  const q = queryById(queryId);
  return {
    kind,
    eps: epsAt(epsIndex),
    delta: DELTA,
    sensitivity: q.sensitivity,
    gridSteps: GRID_STEPS[queryId] ?? 1,
  };
}

/** Typical error and 95% interval, summed off the mechanism's own PMF. */
function utility(spec: MechanismSpec): { meanAbs: number; interval: number } {
  const lat = lattice(spec);
  if (spec.kind === 'continuous-laplace') {
    const b = laplaceScale(spec);
    return { meanAbs: b, interval: -b * Math.log(0.05) };
  }
  if (spec.kind === 'exact') return { meanAbs: 0, interval: 0 };
  const gaussian = spec.kind === 'discrete-gaussian';
  const sigmaSteps = gaussian ? gaussianSigma(spec) / lat.grid : 0;
  const gamma = toNumber(lat.gamma);
  const span = gaussian ? Math.ceil(9 * sigmaSteps) + 10 : Math.ceil(24 / gamma) + 10;
  let meanAbs = 0;
  let mass = 0;
  let interval = 0;
  for (let k = 0; k <= span; k++) {
    const p = gaussian ? discreteGaussianPmf(sigmaSteps, k) : discreteLaplacePmf(gamma, k);
    const weight = k === 0 ? p : 2 * p;
    meanAbs += weight * k;
    mass += weight;
    if (interval === 0 && mass >= 0.95) interval = k;
  }
  return { meanAbs: meanAbs * lat.grid, interval: (interval || span) * lat.grid };
}

export function initDial(): void {
  const querySelect = byId<HTMLSelectElement>('dial-query');
  clear(querySelect);
  for (const q of QUERIES) querySelect.append(el('option', { value: q.id, text: q.label }));
  querySelect.value = countHighEarners.id;

  const mechSelect = byId<HTMLSelectElement>('dial-mech');
  clear(mechSelect);
  for (const kind of ['discrete-laplace', 'discrete-gaussian', 'continuous-laplace', 'exact'] as MechanismKind[]) {
    mechSelect.append(el('option', { value: kind, text: MECHANISM_LABELS[kind] }));
  }

  const slider = byId<HTMLInputElement>('dial-eps');
  slider.max = String(EPS_LADDER.length - 1);
  slider.value = String(EPS_DEFAULT_INDEX);

  /**
   * "Compare the headcount and the payroll at the same ε" is only comparing if
   * two different queries have actually been on screen, so the step is earned
   * by the set of queries seen rather than by any single selection — and only
   * when they differ in sensitivity, since the two Δ = 1 queries teach nothing
   * about Δ.
   */
  const seen = new Set<string>([querySelect.value]);

  const render = (): void => {
    const spec = specFor(querySelect.value, Number(slider.value), mechSelect.value as MechanismKind);
    renderReadout(spec, querySelect.value);
    renderCurve(querySelect.value, mechSelect.value as MechanismKind, Number(slider.value));
  };

  querySelect.addEventListener('change', () => {
    seen.add(querySelect.value);
    update({ queryId: querySelect.value });
    if (new Set([...seen].map((id) => queryById(id).sensitivity)).size > 1) complete('sensitivity');
    render();
  });
  mechSelect.addEventListener('change', render);
  bindEpsSlider(slider, 'dial-eps-value', render);

  byId('dial-release').addEventListener('click', () => {
    const spec = specFor(querySelect.value, Number(slider.value), mechSelect.value as MechanismKind);
    renderRelease(spec, querySelect.value);
  });

  byId('dial-mean').addEventListener('click', () => {
    renderMean(Number(slider.value), mechSelect.value as MechanismKind);
  });

  render();
  clear(byId('dial-release-out'));
  byId('dial-release-out').append(
    verdict('idle', 'No answer released yet', 'Release one and it will differ every time, by design.'),
  );
}

function renderReadout(spec: MechanismSpec, queryId: string): void {
  const q = queryById(queryId);
  const eps = toNumber(spec.eps);
  const lat = lattice(spec);
  const u = utility(spec);
  const trueValue = q.run(EMPLOYEES);
  const asMoney = queryId === 'sum-salary';
  const fmt = (v: number): string => (asMoney ? money(v) : num(v, v < 10 && !Number.isInteger(v) ? 2 : 0));

  const out = byId('dial-out');
  clear(out);

  const stats = [
    stat('Sensitivity Δ', fmt(q.sensitivity), 'what one person can move'),
    stat('ε', String(eps), 'privacy parameter'),
  ];
  if (spec.kind === 'discrete-gaussian') {
    stats.push(stat('σ', fmt(gaussianSigma(spec)), `at δ = ${DELTA.toExponential(0)}`));
  } else if (spec.kind !== 'exact') {
    stats.push(stat('Noise scale b = Δ/ε', fmt(laplaceScale(spec)), 'Laplace'));
  }
  stats.push(
    stat('Typical error', fmt(u.meanAbs), 'mean absolute noise'),
    stat('95% of answers land within', `±${fmt(u.interval)}`, `of the true ${fmt(trueValue)}`),
    stat('Attacker belief can reach', pct(worstCasePosterior(0.5, eps)), 'from an even prior'),
  );
  out.append(statRow(stats, 'Privacy parameters and the utility they cost'));

  out.append(el('p', { class: 'note', text: `Where Δ comes from: ${q.sensitivityWhy}` }));

  // A real approximation, so it is disclosed wherever it applies — but it is
  // an implementation caveat rather than part of the lesson, so it is staged
  // behind a summary that says plainly that it is there.
  if (lat.rounds && (spec.kind === 'discrete-laplace' || spec.kind === 'discrete-gaussian')) {
    out.append(
      el('details', { class: 'data-details' }, [
        el('summary', {
          text: `This query is released on a ${money(lat.grid)} lattice — an approximation, and what it costs`,
        }),
        el('p', {
          text:
            `The exact integer sampler needs about Δ/ε geometric trials per draw, and at Δ = ${money(q.sensitivity)} ` +
            `that is minutes rather than milliseconds. So released answers are placed on a lattice of ` +
            `${money(lat.grid)} instead.`,
        }),
        el('p', {
          text:
            `The true answer is rounded onto that lattice first, and that step is not cosmetic. Without it the two ` +
            `neighbouring databases would land on two different lattices, their supports would be disjoint, and the ` +
            `likelihood ratio would be infinite rather than e^ε — no privacy at all, from something that looks like ` +
            `a rendering detail.`,
        }),
        el('p', {
          text:
            `Rounding costs one lattice step of sensitivity, because two nearby values can round to points one step ` +
            `further apart than they started. The sampler is therefore driven at ε/${lat.shift} rather than ` +
            `ε/${lat.shift - 1}: conservative on purpose, so the released answer is slightly noisier than strictly ` +
            `required and never slightly less private.`,
        }),
      ]),
    );
  }

  if (spec.kind === 'continuous-laplace') {
    out.append(
      layered('warn', 'Textbook mode — this is the sampler Mironov broke', {
        observation:
          'The noise is now drawn as b·ln(u) over a double-precision uniform, which is what nearly every tutorial ' +
          'implementation of the Laplace mechanism does.',
        meaning:
          'That is not the Laplace distribution. It is one with gaps and duplicated masses whose low-order bits ' +
          'depend on the true answer, and Mironov (CCS 2012) turns those artefacts into an attack that recovers it. ' +
          'The mode is offered because seeing it named is the only reliable way to know not to ship it.',
        details: [
          'The failure is entirely in the sampler, not in the mathematics: the calibration b = Δ/ε is correct, the ' +
            'ε is correct, and the mechanism is still broken. This is why "is it differentially private?" is not a ' +
            'question about a formula — a mechanism is only as private as the code that samples it.',
          'The two discrete modes on this control compare exact integers and never touch a float: the Laplace as a ' +
            'difference of two geometrics and the Gaussian by Canonne–Kamath–Steinke rejection, both driven by ' +
            'rational Bernoulli draws from crypto.getRandomValues.',
        ],
      }),
    );
  } else if (spec.kind === 'exact') {
    out.append(
      verdict(
        'bad',
        'No privacy at all — this is the broken mode',
        'Released answers are the true answers. It is offered so the contrast is visible and so Exhibit 1 has ' +
          'something to attack; it is never the default and nothing about it is private.',
      ),
    );
  }
}

function renderRelease(spec: MechanismSpec, queryId: string): void {
  const q = queryById(queryId);
  const trueValue = q.run(EMPLOYEES);
  const asMoney = queryId === 'sum-salary';
  const fmt = (v: number): string => (asMoney ? money(v) : num(v, Number.isInteger(v) ? 0 : 2));

  const rows = Array.from({ length: 6 }, () => release(rng, spec, trueValue));
  const eps = toNumber(spec.eps);
  const out = byId('dial-release-out');
  clear(out);
  out.append(
    el('p', { class: 'muted', text: `Six independent releases of "${q.label}" The true answer is ${fmt(trueValue)}.` }),
    el(
      'ul',
      { class: 'chip-row', 'aria-label': 'Six independent releases of the same query' },
      rows.map((r, i) =>
        el('li', { class: 'chip' }, [
          el('span', { class: 'chip__label', text: `release ${i + 1}` }),
          el('span', { class: 'chip__value mono', text: fmt(r.value) }),
          el('span', { class: 'chip__delta mono', text: signed(r.value - trueValue, fmt) }),
        ]),
      ),
    ),
  );

  // A release is never free, and a panel that shows six of them without saying
  // so teaches that it is. This exhibit quotes rather than charges — a reader
  // comparing mechanisms is not running an attack and should not be locked out
  // of the page for exploring — but the price is always on screen.
  if (spec.kind !== 'exact') {
    const cost = quote(eps, q.label);
    out.append(
      el('p', { class: 'note' }, [
        el('strong', { text: 'What this would cost. ' }),
        document.createTextNode(
          `Six releases of this query at ε = ${eps} is six charges, not one: ${num(6 * eps, 2)} of privacy budget ` +
            `by basic composition. Billed against the session ledger in Exhibit 5, a single one of them would take ` +
            `the total to ${num(cost.total, 3)} of ${num(cost.budget, 2)}` +
            `${cost.wouldRefuse ? ' — which is over budget, so the ledger would refuse it outright' : ''}. This panel ` +
            `quotes the price rather than charging it, so that comparing mechanisms does not exhaust the budget; the ` +
            `ledger is where enforcement actually happens.`,
        ),
      ]),
    );
  }

  // Noise is symmetric and unbounded, so a count can come back negative and a
  // payroll can come back below zero. That is not a bug, and hiding it would be
  // the actual mistake: clamping the released answer to a plausible range is
  // post-processing — free, and therefore always allowed — but it introduces
  // bias, which is a real cost that deployments have to weigh rather than
  // assume away. The page shows the raw release.
  if (rows.some((r) => r.value < 0)) {
    out.append(
      el('p', {
        class: 'note',
        text:
          'One of those answers came back negative — a headcount below zero, or a payroll in deficit. The mechanism ' +
          'has no idea what the number means; it adds symmetric noise to whatever it is given. Clamping the released ' +
          'value back to something plausible is post-processing and costs no privacy, but it biases the estimator, ' +
          'which is why this page shows you the raw release instead of tidying it up.',
      }),
    );
  }

  out.append(el('p', { class: 'note', text: randomnessNote() }));
}

function renderMean(epsIndex: number, kind: MechanismKind): void {
  // Two releases, then a division. The division is free: differential privacy
  // is closed under post-processing, so anything computed from released numbers
  // costs nothing further.
  const sumSpec = specFor(sumSalary.id, epsIndex, kind);
  const countSpec = specFor(headcount.id, epsIndex, kind);
  const noisySum = release(rng, sumSpec, sumSalary.run(EMPLOYEES));
  const noisyCount = release(rng, countSpec, headcount.run(EMPLOYEES));
  const mean = meanFromReleases(noisySum.value, noisyCount.value);
  const trueMean = sumSalary.run(EMPLOYEES) / headcount.run(EMPLOYEES);

  const out = byId('dial-mean-out');
  clear(out);
  out.append(
    statRow(
      [
        stat('Released total payroll', money(noisySum.value), `ε = ${toNumber(sumSpec.eps)}`),
        stat('Released headcount', num(noisyCount.value), `ε = ${toNumber(countSpec.eps)}`),
        stat('Average salary', Number.isFinite(mean) ? money(mean) : '—', `true value ${money(trueMean)}`),
      ],
      'A mean computed from two released numbers',
    ),
    layered('ok', `Total ε spent: ${toNumber(sumSpec.eps) * 2} — the division was free`, {
      observation:
        'Two releases were charged, one for the payroll total and one for the headcount. The division that turned ' +
        'them into an average was charged nothing.',
      meaning:
        'The average is not a third query. It is arithmetic on two numbers already released, and differential ' +
        'privacy is closed under post-processing: no function of a released answer can leak more than that answer ' +
        'already did. This is why a DP system can hand an analyst a released table and leave them alone with it.',
      details: [
        'The proof is a one-liner and worth carrying: if f is any function and M is ε-DP, then for any output set S, ' +
          'Pr[f(M(D)) ∈ S] = Pr[M(D) ∈ f⁻¹(S)] ≤ e^ε · Pr[M(D′) ∈ f⁻¹(S)] = e^ε · Pr[f(M(D′)) ∈ S]. The ' +
          'post-processor never touches the data, so it cannot be a channel to it — and this holds for randomised f ' +
          'and for an adversary with unlimited computing power, which is what makes it a *closure* property rather ' +
          'than a heuristic.',
        'The practical trap sits on the other side of it. Post-processing is free, but *choosing which query to ask ' +
          'next after seeing a released answer* is not post-processing — it is adaptive composition, and it is ' +
          'charged. An analyst who reads one release and picks their next question from it is spending budget in a ' +
          'way that a ledger counting only "queries asked" still captures correctly, which is why the ledger charges ' +
          'per release and never tries to be clever about intent.',
      ],
    }),
  );
}

function renderCurve(queryId: string, kind: MechanismKind, epsIndex: number): void {
  const asMoney = queryId === 'sum-salary';
  const drawKind: MechanismKind = kind === 'exact' ? 'discrete-laplace' : kind;
  const points: [number, number][] = [];
  const posterior: [number, number][] = [];
  EPS_LADDER.forEach((text, i) => {
    const eps = Number(text);
    points.push([eps, utility(specFor(queryId, i, drawKind)).interval]);
    posterior.push([eps, worstCasePosterior(0.5, eps) * 100]);
  });

  const current = Number(EPS_LADDER[epsIndex]);
  const mount = byId('dial-curve');
  clear(mount);
  mount.append(
    chart({
      ariaLabel:
        'The width of the 95% interval as ε rises, on a logarithmic vertical axis. Smaller ε means stronger privacy ' +
        'and a wider interval.',
      xLabel: 'ε',
      yLabel: asMoney ? '±95% interval ($)' : '±95% interval',
      yLog: true,
      yMin: 1,
      // ε spans 0.01 to 10; on a linear axis the entire interesting end is a
      // smear against the left margin.
      xLog: true,
      series: [{ id: 'err', label: 'error', kind: 'line', style: 'a', points }],
      markers: [{ x: current, label: `ε = ${current}`, style: 'ceiling' }],
      height: 210,
      padLeft: asMoney ? 74 : 62,
      xTickFormat: (v) => (v < 1 ? String(v) : num(v)),
      yTickFormat: (v) => (asMoney ? compactMoney(v) : num(v)),
    }),
    chart({
      ariaLabel:
        'How far an attacker\'s belief can move, as ε rises, starting from an even prior. It climbs from 50% toward ' +
        'certainty.',
      xLabel: 'ε',
      yLabel: 'belief can reach (%)',
      yMin: 40,
      yMax: 100,
      xLog: true,
      series: [{ id: 'post', label: 'posterior', kind: 'line', style: 'b', points: posterior }],
      markers: [{ x: current, label: `ε = ${current}`, style: 'ceiling' }],
      height: 190,
      xTickFormat: (v) => (v < 1 ? String(v) : num(v)),
      yTickFormat: (v) => `${v.toFixed(0)}%`,
    }),
    legend([
      { label: 'how wrong the answer is (95% interval)', style: 'a', kind: 'line' },
      { label: 'how much an attacker can conclude (worst-case belief)', style: 'b', kind: 'line' },
      { label: 'the ε you have selected', style: 'ceiling', kind: 'line' },
    ]),
    chartData({
      caption: `Both sides of the trade at every stop on the ε ladder, for "${queryById(queryId).label}".`,
      headers: ['ε', '±95% interval', 'Belief can reach', 'Noise scale b = Δ/ε'],
      rows: EPS_LADDER.map((text, i) => {
        const eps = Number(text);
        const s = specFor(queryId, i, drawKind);
        return [
          text + (i === epsIndex ? '  ← selected' : ''),
          asMoney ? compactMoney(utility(s).interval) : num(utility(s).interval),
          pct(worstCasePosterior(0.5, eps)),
          asMoney ? compactMoney(laplaceScale(s)) : num(laplaceScale(s), 2),
        ];
      }),
      trend:
        'As ε rises the interval shrinks roughly in proportion to 1/ε while the attacker’s belief bound climbs from ' +
        '50% toward certainty — the two columns move in opposite directions at every row.',
      notice:
        `There is no row where both columns are good, which is the entire subject. Then change the query above and ` +
        `read the table again: the belief column is identical, because it depends only on ε, and the interval column ` +
        `moves by five orders of magnitude, because it depends on Δ. That is the difference between what ε promises ` +
        `and what the mechanism costs.`,
    }),
    el('p', {
      class: 'note',
      text:
        'These are the same axis read two ways, and no value of ε is right for both. That is the whole subject: ' +
        'differential privacy does not remove the trade-off between a useful answer and a private one, it makes the ' +
        'trade-off a number you have to write down and defend.',
    }),
  );
}
