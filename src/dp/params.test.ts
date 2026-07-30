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

  it('derives RAPPOR\'s ε from its published randomisation probability', () => {
    const rappor = DEPLOYMENTS.find((d) => d.id === 'rappor')!;
    expect(rappor.eps).toBeCloseTo(rapporEpsilonInfinity(0.5), 12);
    expect(rappor.eps).toBeCloseTo(2 * Math.log(3), 12);
  });
});

describe('RAPPOR\'s longitudinal bound', () => {
  it('falls as more randomisation is applied', () => {
    expect(rapporEpsilonInfinity(0.75)).toBeLessThan(rapporEpsilonInfinity(0.5));
    expect(rapporEpsilonInfinity(0.25)).toBeGreaterThan(rapporEpsilonInfinity(0.5));
  });

  it('goes to zero as f approaches 1 — total randomisation, no information', () => {
    expect(rapporEpsilonInfinity(0.999)).toBeLessThan(0.01);
  });

  it('rejects an f outside (0,1)', () => {
    expect(() => rapporEpsilonInfinity(0)).toThrow();
    expect(() => rapporEpsilonInfinity(1)).toThrow();
  });
});
