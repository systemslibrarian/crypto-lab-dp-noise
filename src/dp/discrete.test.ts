import { describe, expect, it } from 'vitest';
import {
  discreteGaussianPmf,
  discreteLaplacePmf,
  sampleDiscreteGaussian,
  sampleDiscreteLaplace,
} from './discrete';
import { rat, toNumber } from './rational';
import { seededRng } from './rng';

describe('discrete Laplace', () => {
  it('has a PMF that sums to one', () => {
    for (const gamma of [0.1, 0.5, 1, 3]) {
      let z = 0;
      for (let x = -400; x <= 400; x++) z += discreteLaplacePmf(gamma, x);
      expect(z).toBeCloseTo(1, 9);
    }
  });

  it('satisfies the ε bound exactly: one step of shift costs exactly e^γ', () => {
    // This is the whole guarantee in one line. For the two-sided geometric the
    // worst-case ratio is attained, not merely bounded — so a sampler that was
    // even slightly too narrow would show up here.
    for (const gamma of [0.05, 0.5, 2]) {
      let worst = 0;
      for (let x = -200; x <= 200; x++) {
        const a = discreteLaplacePmf(gamma, x);
        const b = discreteLaplacePmf(gamma, x - 1);
        worst = Math.max(worst, a / b, b / a);
      }
      expect(worst).toBeCloseTo(Math.exp(gamma), 9);
    }
  });

  it('samples match the PMF it advertises', () => {
    const rng = seededRng(21);
    const gamma = rat(1, 2); // γ = 0.5
    const draws = 40_000;
    const counts = new Map<number, number>();
    for (let i = 0; i < draws; i++) {
      const x = sampleDiscreteLaplace(rng, gamma);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    for (const x of [-3, -2, -1, 0, 1, 2, 3]) {
      const observed = (counts.get(x) ?? 0) / draws;
      expect(observed).toBeCloseTo(discreteLaplacePmf(toNumber(gamma), x), 2);
    }
  });

  it('is symmetric and has variance 2p/(1−p)²', () => {
    const rng = seededRng(22);
    const gamma = rat(1, 1);
    const p = Math.exp(-1);
    const draws = 40_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < draws; i++) {
      const x = sampleDiscreteLaplace(rng, gamma);
      sum += x;
      sumSq += x * x;
    }
    expect(sum / draws).toBeCloseTo(0, 1);
    expect(sumSq / draws).toBeCloseTo((2 * p) / (1 - p) ** 2, 1);
  });

  it('widens as γ shrinks — the ε slider in one assertion', () => {
    const rng = seededRng(23);
    const spread = (gammaD: number): number => {
      let sumSq = 0;
      const draws = 4_000;
      for (let i = 0; i < draws; i++) {
        const x = sampleDiscreteLaplace(rng, rat(1, gammaD));
        sumSq += x * x;
      }
      return Math.sqrt(sumSq / draws);
    };
    expect(spread(8)).toBeGreaterThan(spread(2));
    expect(spread(2)).toBeGreaterThan(spread(1));
  });
});

describe('discrete Gaussian', () => {
  it('has a PMF that sums to one', () => {
    for (const sigma of [1, 4, 20]) {
      let z = 0;
      for (let x = -Math.ceil(12 * sigma); x <= Math.ceil(12 * sigma); x++) z += discreteGaussianPmf(sigma, x);
      expect(z).toBeCloseTo(1, 9);
    }
  });

  it('samples with the right mean and variance', () => {
    const rng = seededRng(31);
    const sigma = 6;
    const draws = 12_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < draws; i++) {
      const x = sampleDiscreteGaussian(rng, rat(sigma * sigma));
      sum += x;
      sumSq += x * x;
    }
    expect(sum / draws).toBeCloseTo(0, 0);
    // For σ ≥ 1 the discrete Gaussian's variance is within a fraction of a
    // percent of σ²; the tolerance here is sampling error, not model error.
    expect(Math.sqrt(sumSq / draws)).toBeGreaterThan(sigma * 0.93);
    expect(Math.sqrt(sumSq / draws)).toBeLessThan(sigma * 1.07);
  });

  it('accepts a non-integer σ² without leaving the integers', () => {
    const rng = seededRng(32);
    for (let i = 0; i < 300; i++) {
      const x = sampleDiscreteGaussian(rng, rat(2537n, 100n));
      expect(Number.isInteger(x)).toBe(true);
    }
  });

  it('has tails that fall faster than the Laplace of matching spread', () => {
    // The reason the Gaussian mechanism cannot give pure ε-DP: its tail is
    // lighter, so the *ratio* between two shifted copies grows without bound.
    const sigma = 5;
    const gamma = Math.SQRT2 / sigma; // matched standard deviation
    const gaussTail = discreteGaussianPmf(sigma, 30) / discreteGaussianPmf(sigma, 0);
    const lapTail = discreteLaplacePmf(gamma, 30) / discreteLaplacePmf(gamma, 0);
    expect(gaussTail).toBeLessThan(lapTail);
  });
});
