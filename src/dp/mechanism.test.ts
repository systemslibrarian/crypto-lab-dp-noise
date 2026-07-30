import { describe, expect, it } from 'vitest';
import { countHighEarners, EMPLOYEES, sumSalary, TARGET_ID, without } from './database';
import { discreteLaplacePmf } from './discrete';
import {
  gaussianSigma,
  lattice,
  laplaceScale,
  release,
  worstCasePosterior,
  type MechanismSpec,
} from './mechanism';
import { epsAt, EPS_LADDER } from './params';
import { rat, toNumber } from './rational';
import { seededRng } from './rng';

const countSpec = (eps: string): MechanismSpec => ({
  kind: 'discrete-laplace',
  eps: epsAt(EPS_LADDER.indexOf(eps)),
  delta: 0,
  sensitivity: countHighEarners.sensitivity,
  gridSteps: 1,
});

const sumSpec = (eps: string): MechanismSpec => ({
  kind: 'discrete-laplace',
  eps: epsAt(EPS_LADDER.indexOf(eps)),
  delta: 0,
  sensitivity: sumSalary.sensitivity,
  gridSteps: 50,
});

describe('the release lattice', () => {
  it('leaves an integer query with Δ = 1 alone', () => {
    const lat = lattice(countSpec('1'));
    expect(lat.grid).toBe(1);
    expect(lat.rounds).toBe(false);
    expect(lat.shift).toBe(1);
    expect(toNumber(lat.gamma)).toBeCloseTo(1, 12);
  });

  it('pays one extra step of sensitivity when it has to round', () => {
    // Rounding two nearby reals onto a lattice can push them one step further
    // apart, so the sensitivity in lattice units is gridSteps + 1, not
    // gridSteps. Getting this wrong is a silent privacy loss.
    const lat = lattice(sumSpec('1'));
    expect(lat.grid).toBe(5_000);
    expect(lat.rounds).toBe(true);
    expect(lat.shift).toBe(51);
    expect(toNumber(lat.gamma)).toBeCloseTo(1 / 51, 12);
  });

  it('keeps ε·(steps) equal to ε however the lattice is chosen', () => {
    for (const steps of [1, 10, 50, 200]) {
      const spec: MechanismSpec = { ...sumSpec('2'), gridSteps: steps };
      const lat = lattice(spec);
      expect(toNumber(lat.gamma) * lat.shift).toBeCloseTo(2, 12);
    }
  });

  it('never lets two neighbouring answers land further apart than the shift', () => {
    // The claim the lattice arithmetic exists to support, checked against the
    // real database rather than assumed.
    const lat = lattice(sumSpec('1'));
    const a = Math.round(sumSalary.run(EMPLOYEES) / lat.grid);
    const b = Math.round(sumSalary.run(without(EMPLOYEES, TARGET_ID)) / lat.grid);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(lat.shift);
  });
});

describe('release', () => {
  it('returns the true answer untouched in exact mode', () => {
    const rng = seededRng(51);
    const spec: MechanismSpec = { ...countSpec('1'), kind: 'exact' };
    for (let i = 0; i < 20; i++) {
      const r = release(rng, spec, 6);
      expect(r.value).toBe(6);
      expect(r.noise).toBe(0);
    }
  });

  it('keeps a count query on the integers', () => {
    const rng = seededRng(52);
    for (let i = 0; i < 400; i++) {
      expect(Number.isInteger(release(rng, countSpec('0.5'), 6).value)).toBe(true);
    }
  });

  it('keeps a coarse-lattice query on its lattice', () => {
    const rng = seededRng(53);
    const spec = sumSpec('1');
    const lat = lattice(spec);
    for (let i = 0; i < 200; i++) {
      const r = release(rng, spec, 1_240_000);
      expect(r.value % lat.grid).toBe(0);
    }
  });

  it('is unbiased, with the spread ε predicts', () => {
    const rng = seededRng(54);
    const spec = countSpec('0.5');
    const draws = 20_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < draws; i++) {
      const n = release(rng, spec, 6).noise;
      sum += n;
      sumSq += n * n;
    }
    expect(sum / draws).toBeCloseTo(0, 0);
    const p = Math.exp(-0.5);
    expect(sumSq / draws).toBeCloseTo((2 * p) / (1 - p) ** 2, 0);
  });

  it('draws real noise from the continuous mode too', () => {
    const rng = seededRng(55);
    const spec: MechanismSpec = { ...countSpec('1'), kind: 'continuous-laplace' };
    const values = new Set<number>();
    for (let i = 0; i < 50; i++) values.add(release(rng, spec, 6).value);
    expect(values.size).toBeGreaterThan(40);
    expect([...values].every(Number.isFinite)).toBe(true);
  });

  it('samples the discrete Gaussian on the release lattice', () => {
    const rng = seededRng(56);
    const spec: MechanismSpec = { ...countSpec('1'), kind: 'discrete-gaussian', delta: 1e-5 };
    for (let i = 0; i < 200; i++) {
      expect(Number.isInteger(release(rng, spec, 6).value)).toBe(true);
    }
  });
});

/**
 * The end-to-end privacy claim: run the *real* release path for the two real
 * neighbouring databases and check that no output is more than e^ε times more
 * likely under one than the other.
 */
describe('the guarantee, end to end on the real database', () => {
  it.each(EPS_LADDER)('holds for the counting query at ε = %s', (text) => {
    const spec = countSpec(text);
    const lat = lattice(spec);
    const withTarget = countHighEarners.run(EMPLOYEES);
    const withoutTarget = countHighEarners.run(without(EMPLOYEES, TARGET_ID));
    expect(Math.abs(withTarget - withoutTarget)).toBe(1);

    const gamma = toNumber(lat.gamma);
    let worst = 0;
    const span = Math.ceil(40 / gamma) + 10;
    for (let x = -span; x <= span; x++) {
      const a = discreteLaplacePmf(gamma, x - withTarget);
      const b = discreteLaplacePmf(gamma, x - withoutTarget);
      worst = Math.max(worst, a / b, b / a);
    }
    expect(worst).toBeLessThanOrEqual(Math.exp(Number(text)) * (1 + 1e-9));
  });

  it('holds for the coarse-lattice sum query', () => {
    const spec = sumSpec('1');
    const lat = lattice(spec);
    const a = Math.round(sumSalary.run(EMPLOYEES) / lat.grid);
    const b = Math.round(sumSalary.run(without(EMPLOYEES, TARGET_ID)) / lat.grid);
    const gamma = toNumber(lat.gamma);
    let worst = 0;
    for (let x = -3000; x <= 3000; x++) {
      const pa = discreteLaplacePmf(gamma, x - a);
      const pb = discreteLaplacePmf(gamma, x - b);
      worst = Math.max(worst, pa / pb, pb / pa);
    }
    expect(worst).toBeLessThanOrEqual(Math.E * (1 + 1e-9));
  });
});

describe('scale and σ', () => {
  it('gives the Laplace scale b = Δ/ε', () => {
    expect(laplaceScale({ ...countSpec('1'), eps: rat(1, 2) })).toBe(2);
    expect(laplaceScale(sumSpec('1'))).toBe(250_000);
  });

  it('gives a σ that grows as ε falls', () => {
    const strict: MechanismSpec = { ...countSpec('0.1'), kind: 'discrete-gaussian', delta: 1e-5 };
    const loose: MechanismSpec = { ...countSpec('2'), kind: 'discrete-gaussian', delta: 1e-5 };
    expect(gaussianSigma(strict)).toBeGreaterThan(gaussianSigma(loose));
  });
});

describe('worstCasePosterior — what ε costs you in belief', () => {
  it('leaves an even prior even at ε = 0', () => {
    expect(worstCasePosterior(0.5, 0)).toBeCloseTo(0.5, 12);
  });

  it('moves an even prior to e^ε/(1+e^ε)', () => {
    expect(worstCasePosterior(0.5, Math.log(3))).toBeCloseTo(0.75, 12);
    expect(worstCasePosterior(0.5, 1)).toBeCloseTo(Math.E / (1 + Math.E), 12);
  });

  it('barely moves a small prior at a small ε, and swamps it at a large one', () => {
    expect(worstCasePosterior(0.01, 0.1)).toBeLessThan(0.012);
    expect(worstCasePosterior(0.01, 10)).toBeGreaterThan(0.99);
  });
});
