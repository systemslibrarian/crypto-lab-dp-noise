import { describe, expect, it } from 'vitest';
import { DEPLOYMENTS, EPS_DEFAULT_INDEX, EPS_LADDER, epsAt, epsLabel, rapporEpsilonInfinity } from './params';
import { toNumber } from './rational';

describe('the ε ladder', () => {
  it('spans the range the demo claims, in increasing order', () => {
    expect(EPS_LADDER[0]).toBe('0.01');
    expect(EPS_LADDER[EPS_LADDER.length - 1]).toBe('10');
    const values = EPS_LADDER.map(Number);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });

  it('is exactly representable as rationals — the samplers depend on it', () => {
    for (const text of EPS_LADDER) {
      const r = epsAt(EPS_LADDER.indexOf(text));
      expect(toNumber(r)).toBeCloseTo(Number(text), 12);
      expect(r.d).toBeLessThanOrEqual(100n);
    }
  });

  it('defaults to ε = 1', () => {
    expect(epsLabel(EPS_DEFAULT_INDEX)).toBe('1');
  });

  it('clamps out-of-range indices instead of throwing at the UI', () => {
    expect(epsLabel(-5)).toBe('0.01');
    expect(epsLabel(9999)).toBe('10');
  });
});

describe('deployments', () => {
  it('says where every ε came from', () => {
    for (const d of DEPLOYMENTS) {
      expect(['published', 'measured', 'derived']).toContain(d.provenance);
      expect(d.sourceUrl).toMatch(/^https:\/\//);
      expect(d.epsNote.length).toBeGreaterThan(30);
      expect(d.eps).toBeGreaterThan(0);
    }
  });

  it('covers both trust models', () => {
    expect(DEPLOYMENTS.some((d) => d.model === 'local')).toBe(true);
    expect(DEPLOYMENTS.some((d) => d.model === 'global')).toBe(true);
  });

  it('derives RAPPOR\'s ε from the parameters the paper reports for Chrome', () => {
    const rappor = DEPLOYMENTS.find((d) => d.id === 'rappor')!;
    // Section 5.4: 128-bit Bloom filter, h = 2 hash functions, 32 cohorts,
    // f = 0.75, p = 0.5, q = 0.75.
    expect(rappor.eps).toBeCloseTo(rapporEpsilonInfinity(0.75, 2), 12);
    expect(rappor.eps).toBeCloseTo(4 * Math.log(5 / 3), 12);
    expect(rappor.eps).toBeCloseTo(2.0433, 4);
  });
});

describe('RAPPOR\'s longitudinal bound', () => {
  it('falls as more randomisation is applied', () => {
    expect(rapporEpsilonInfinity(0.75, 2)).toBeLessThan(rapporEpsilonInfinity(0.5, 2));
    expect(rapporEpsilonInfinity(0.25, 2)).toBeGreaterThan(rapporEpsilonInfinity(0.5, 2));
  });

  it('scales linearly with the number of hash functions', () => {
    // Theorem 1's factor is 2h, not 2. Dropping it is the transcription that
    // reports a guarantee twice as strong as the paper proves for h = 2.
    expect(rapporEpsilonInfinity(0.75, 2)).toBeCloseTo(2 * rapporEpsilonInfinity(0.75, 1), 12);
    expect(rapporEpsilonInfinity(0.75, 4)).toBeCloseTo(4 * rapporEpsilonInfinity(0.75, 1), 12);
  });

  it('goes to zero as f approaches 1 — total randomisation, no information', () => {
    expect(rapporEpsilonInfinity(0.999, 2)).toBeLessThan(0.01);
  });

  it('rejects an f outside (0,1) or a non-positive-integer h', () => {
    expect(() => rapporEpsilonInfinity(0, 2)).toThrow();
    expect(() => rapporEpsilonInfinity(1, 2)).toThrow();
    expect(() => rapporEpsilonInfinity(0.75, 0)).toThrow();
    expect(() => rapporEpsilonInfinity(0.75, 1.5)).toThrow();
  });
});
