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
import { epsAt, EPS_DEFAULT_INDEX, EPS_LADDER, epsLabel } from '../dp/params';
import { toNumber } from '../dp/rational';
import { cryptoRng } from '../dp/rng';
import { chart, legend } from './chart';
import { byId, clear, compactMoney, el, money, num, pct, signed, stat, statRow, verdict } from './dom';

const rng = cryptoRng();
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

  const render = (): void => {
    byId('dial-eps-value').textContent = epsLabel(Number(slider.value));
    const spec = specFor(querySelect.value, Number(slider.value), mechSelect.value as MechanismKind);
    renderReadout(spec, querySelect.value);
    renderCurve(querySelect.value, mechSelect.value as MechanismKind, Number(slider.value));
  };

  for (const control of [querySelect, mechSelect]) control.addEventListener('change', render);
  slider.addEventListener('input', render);

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

  if (lat.rounds && (spec.kind === 'discrete-laplace' || spec.kind === 'discrete-gaussian')) {
    out.append(
      el('p', {
        class: 'note',
        text:
          `This query is released on a lattice of ${money(lat.grid)}: the exact integer sampler would need about ` +
          `Δ/ε geometric trials per draw at Δ = ${money(q.sensitivity)}, which is minutes rather than milliseconds. ` +
          `The true answer is rounded onto that lattice first — if it were not, the two neighbouring databases would ` +
          `land on two different lattices, their supports would be disjoint, and the ratio would be infinite rather ` +
          `than e^ε. Rounding costs one lattice step of sensitivity, so the sampler is driven at ε/${lat.shift}, not ε/${lat.shift - 1}.`,
      }),
    );
  }

  if (spec.kind === 'continuous-laplace') {
    out.append(
      verdict(
        'warn',
        'Textbook mode — this is the sampler Mironov broke',
        'Sampling Laplace noise as b·ln(u) over a double-precision uniform gives a distribution with gaps and ' +
          'duplicated masses whose low bits depend on the true answer. Mironov (CCS 2012) turns those artefacts into ' +
          'a recovery attack. It is here because it is what almost every tutorial implements, and because seeing it ' +
          'named is the only way to know not to ship it. The other two modes on this control draw only exact rational ' +
          'Bernoullis and never touch a float.',
      ),
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
    verdict(
      'ok',
      `Total ε spent: ${toNumber(sumSpec.eps) * 2} — the division was free`,
      'The average is not a third query. It is arithmetic on two numbers that have already been released, and ' +
        'differential privacy is closed under post-processing: no function of a released answer can leak more than the ' +
        'answer already did. That is why a DP system can hand analysts a released table and let them compute whatever ' +
        'they like on it without any further accounting.',
    ),
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
    el('p', {
      class: 'note',
      text:
        'These are the same axis read two ways, and no value of ε is right for both. That is the whole subject: ' +
        'differential privacy does not remove the trade-off between a useful answer and a private one, it makes the ' +
        'trade-off a number you have to write down and defend.',
    }),
  );
}
