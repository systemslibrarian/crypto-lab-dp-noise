import { describe, expect, it } from 'vitest';
import { bernoulli, bernoulliExpNeg, geometricExpNeg, seededRng, uniformBelow } from './rng';

/**
 * Every statistical assertion here runs on a seeded generator. A sampler either
 * has the right distribution or it does not; a test that fails one CI run in
 * fifty is not evidence of either.
 */
describe('uniformBelow', () => {
  it('covers every residue with no modulo bias', () => {
    const rng = seededRng(1);
    const n = 7n;
    const counts = new Array(7).fill(0);
    const draws = 70_000;
    for (let i = 0; i < draws; i++) counts[Number(uniformBelow(rng, n))]++;
    const expected = draws / 7;
    // χ² with 6 d.o.f. exceeds 22.5 about once in a thousand runs.
    const chi2 = counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
    expect(chi2).toBeLessThan(22.5);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('handles bounds that straddle a 32-bit word', () => {
    const rng = seededRng(2);
    const n = (1n << 33n) + 12345n;
    for (let i = 0; i < 200; i++) {
      const v = uniformBelow(rng, n);
      expect(v).toBeGreaterThanOrEqual(0n);
      expect(v).toBeLessThan(n);
    }
  });

  it('is degenerate at n = 1 and rejects n ≤ 0', () => {
    expect(uniformBelow(seededRng(3), 1n)).toBe(0n);
    expect(() => uniformBelow(seededRng(3), 0n)).toThrow();
  });
});

describe('bernoulli', () => {
  it('hits the rational probability it was given', () => {
    const rng = seededRng(4);
    let hits = 0;
    const draws = 40_000;
    for (let i = 0; i < draws; i++) if (bernoulli(rng, 3n, 8n)) hits++;
    expect(hits / draws).toBeCloseTo(0.375, 2);
  });

  it('saturates at the ends without consuming a draw', () => {
    const rng = seededRng(5);
    expect(bernoulli(rng, 0n, 5n)).toBe(false);
    expect(bernoulli(rng, 5n, 5n)).toBe(true);
    expect(bernoulli(rng, 9n, 5n)).toBe(true);
  });
});

describe('bernoulliExpNeg', () => {
  // The alternating-series argument in CKS20 Algorithm 1 is easy to transcribe
  // with the parity inverted, which yields Bernoulli(1 − e^−γ) — a sampler that
  // looks fine and is exactly wrong. These cases pin the parity down.
  it.each([
    [1n, 10n, Math.exp(-0.1)],
    [1n, 2n, Math.exp(-0.5)],
    [1n, 1n, Math.exp(-1)],
    [3n, 2n, Math.exp(-1.5)],
    [7n, 2n, Math.exp(-3.5)],
  ])('matches e^-(%s/%s)', (n, d, expected) => {
    const rng = seededRng(Number(n) * 31 + Number(d));
    let hits = 0;
    const draws = 60_000;
    for (let i = 0; i < draws; i++) if (bernoulliExpNeg(rng, n, d)) hits++;
    expect(hits / draws).toBeCloseTo(expected, 2);
  });

  it('is deterministic at γ = 0', () => {
    const rng = seededRng(9);
    for (let i = 0; i < 50; i++) expect(bernoulliExpNeg(rng, 0n, 5n)).toBe(true);
  });

  it('rejects a negative γ', () => {
    expect(() => bernoulliExpNeg(seededRng(9), -1n, 5n)).toThrow();
  });
});

describe('geometricExpNeg', () => {
  it('has mean p/(1−p) for p = e^−γ', () => {
    const rng = seededRng(11);
    const gammaN = 1n;
    const gammaD = 4n; // γ = 0.25
    const p = Math.exp(-0.25);
    const draws = 20_000;
    let sum = 0;
    for (let i = 0; i < draws; i++) sum += geometricExpNeg(rng, gammaN, gammaD);
    expect(sum / draws).toBeCloseTo(p / (1 - p), 1);
  });
});
