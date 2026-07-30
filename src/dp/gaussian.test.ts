import { describe, expect, it } from 'vitest';
import { analyticDelta, analyticSigma, classicSigma, gaussianLogRatio } from './gaussian';

describe('classic calibration', () => {
  it('reproduces the textbook formula', () => {
    // σ = Δ√(2 ln(1.25/δ))/ε, worked by hand for Δ = 1, ε = 0.5, δ = 1e-5.
    expect(classicSigma(1, 0.5, 1e-5)).toBeCloseTo(9.689610525210778, 9);
    // √(2·ln(125000)) = 4.844805…, divided by ε = 0.5.
    expect(classicSigma(1, 0.5, 1e-5)).toBeCloseTo(Math.sqrt(2 * Math.log(125_000)) / 0.5, 12);
  });

  it('is a valid but loose bound wherever it is claimed to hold', () => {
    // The textbook σ is only claimed for ε < 1. Where it is claimed, the exact
    // δ at that σ must come in under the target — and it does, by a lot, which
    // is the whole reason the analytic version exists.
    for (const eps of [0.05, 0.1, 0.3, 0.5, 0.9]) {
      for (const delta of [1e-4, 1e-6, 1e-9]) {
        const sigma = classicSigma(1, eps, delta);
        expect(analyticDelta(1, eps, sigma)).toBeLessThan(delta);
      }
    }
  });
});

describe('analytic calibration (Balle & Wang 2018)', () => {
  it('inverts its own δ', () => {
    for (const eps of [0.1, 0.5, 1, 2, 5]) {
      for (const delta of [1e-3, 1e-6, 1e-10]) {
        const sigma = analyticSigma(1, eps, delta);
        expect(analyticDelta(1, eps, sigma) / delta).toBeCloseTo(1, 6);
      }
    }
  });

  it('beats the textbook calibration everywhere the textbook one applies', () => {
    // The paper's headline claim, checked rather than quoted.
    for (const eps of [0.05, 0.1, 0.3, 0.5, 0.9]) {
      for (const delta of [1e-4, 1e-6, 1e-9]) {
        expect(analyticSigma(1, eps, delta)).toBeLessThan(classicSigma(1, eps, delta));
      }
    }
  });

  it('scales linearly with sensitivity', () => {
    const unit = analyticSigma(1, 1, 1e-6);
    expect(analyticSigma(250, 1, 1e-6)).toBeCloseTo(250 * unit, 6);
  });

  it('gives a smaller σ as ε or δ grows', () => {
    expect(analyticSigma(1, 2, 1e-6)).toBeLessThan(analyticSigma(1, 1, 1e-6));
    expect(analyticSigma(1, 1, 1e-3)).toBeLessThan(analyticSigma(1, 1, 1e-9));
  });

  it('works at ε ≥ 1, where the textbook formula is not valid at all', () => {
    const sigma = analyticSigma(1, 4, 1e-6);
    expect(analyticDelta(1, 4, sigma) / 1e-6).toBeCloseTo(1, 6);
  });

  it('rejects out-of-range δ', () => {
    expect(() => analyticSigma(1, 1, 0)).toThrow();
    expect(() => analyticSigma(1, 1, 1)).toThrow();
  });
});

describe('why the Gaussian needs δ at all', () => {
  it('has a likelihood ratio that grows without bound in the tail', () => {
    // Laplace's ratio flattens at e^ε. The Gaussian's does not flatten at all —
    // it is linear in the output, so for any ceiling there is an output above it.
    const sigma = 10;
    const r = (x: number): number => gaussianLogRatio(1, sigma, x, 0);
    expect(r(100)).toBeGreaterThan(r(50));
    expect(r(1000)).toBeGreaterThan(r(100));
    expect(r(1e6)).toBeGreaterThan(50);
  });

  it('is symmetric about the half-way point between the two databases', () => {
    // At x = Δ/2 the two shifted Gaussians are equally likely: log ratio zero.
    expect(gaussianLogRatio(1, 3, 0.5, 0)).toBeCloseTo(0, 12);
  });
});
