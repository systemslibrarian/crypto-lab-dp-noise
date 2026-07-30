import { describe, expect, it } from 'vitest';
import {
  laplaceCdf,
  laplaceIcdf,
  laplaceInterval,
  laplacePdf,
  laplaceStdDev,
  sampleContinuousLaplace,
  uniformDouble,
} from './laplace';
import { seededRng } from './rng';

/** Closed-form values, computed by hand from the definition. */
describe('continuous Laplace — known answers', () => {
  it('has density 1/2b at the centre', () => {
    expect(laplacePdf(1, 0)).toBeCloseTo(0.5, 15);
    expect(laplacePdf(4, 0)).toBeCloseTo(0.125, 15);
  });

  it('halves the density every b·ln2 from the centre', () => {
    expect(laplacePdf(1, Math.LN2)).toBeCloseTo(0.25, 15);
  });

  it('has CDF ½ at the centre and 1 − ½e^(−x/b) above it', () => {
    expect(laplaceCdf(3, 0)).toBeCloseTo(0.5, 15);
    expect(laplaceCdf(1, 1)).toBeCloseTo(1 - 0.5 * Math.exp(-1), 15);
    expect(laplaceCdf(1, -1)).toBeCloseTo(0.5 * Math.exp(-1), 15);
  });

  it('inverts its own CDF', () => {
    for (const b of [0.5, 1, 1000]) {
      for (const p of [0.001, 0.1, 0.5, 0.9, 0.999]) {
        expect(laplaceCdf(b, laplaceIcdf(b, p))).toBeCloseTo(p, 12);
      }
    }
  });

  it('places the 75th percentile at b·ln2', () => {
    expect(laplaceIcdf(1, 0.75)).toBeCloseTo(Math.LN2, 15);
  });

  it('rejects probabilities outside (0,1)', () => {
    expect(() => laplaceIcdf(1, 0)).toThrow();
    expect(() => laplaceIcdf(1, 1)).toThrow();
  });

  it('has a 95% interval of −b·ln(0.05) = 2.9957·b', () => {
    expect(laplaceInterval(1, 0.95)).toBeCloseTo(2.995732273553991, 12);
    expect(laplaceInterval(20, 0.95)).toBeCloseTo(59.91464547107982, 10);
  });

  it('has standard deviation b√2', () => {
    expect(laplaceStdDev(7)).toBeCloseTo(9.899494936611665, 12);
  });
});

describe('the textbook float sampler', () => {
  it('produces the advertised spread', () => {
    const rng = seededRng(41);
    const b = 3;
    const draws = 40_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < draws; i++) {
      const x = sampleContinuousLaplace(b, () => uniformDouble(() => rng.nextUint32()));
      sum += x;
      sumSq += x * x;
    }
    expect(sum / draws).toBeCloseTo(0, 0);
    expect(Math.sqrt(sumSq / draws)).toBeCloseTo(laplaceStdDev(b), 0);
  });

  it('never returns a non-finite value, however the uniform lands', () => {
    // ln(0) is the crash every tutorial implementation ships with.
    const edgy = [0, 1, 0.5, 1e-300, 1 - 1e-16];
    let i = 0;
    const value = sampleContinuousLaplace(1, () => edgy[Math.min(i++, edgy.length - 1)]);
    expect(Number.isFinite(value)).toBe(true);
  });

  it('draws uniforms strictly inside (0,1)', () => {
    const rng = seededRng(42);
    for (let i = 0; i < 5_000; i++) {
      const u = uniformDouble(() => rng.nextUint32());
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
    }
  });
});
