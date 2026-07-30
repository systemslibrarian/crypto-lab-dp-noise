import { describe, expect, it } from 'vitest';
import {
  advancedComposition,
  basicComposition,
  bestComposition,
  Ledger,
  type Spend,
} from './composition';

const spends = (n: number, eps: number, delta = 0): Spend[] =>
  Array.from({ length: n }, (_, i) => ({ eps, delta, label: `q${i}` }));

describe('basic composition', () => {
  it('adds', () => {
    const r = basicComposition(spends(5, 0.2, 1e-7));
    expect(r.eps).toBeCloseTo(1, 12);
    expect(r.delta).toBeCloseTo(5e-7, 15);
  });

  it('is zero for no queries', () => {
    expect(basicComposition([]).eps).toBe(0);
  });
});

describe('advanced composition', () => {
  it('buys √k instead of k once k is large', () => {
    const many = spends(1000, 0.01);
    expect(basicComposition(many).eps).toBeCloseTo(10, 9);
    expect(advancedComposition(many, 1e-6).eps).toBeLessThan(2);
  });

  it('loses to basic composition for a handful of queries', () => {
    // Advanced composition is not simply better — it pays a fixed √(2 ln(1/δ'))
    // toll that only amortises over many queries.
    const few = spends(2, 0.5);
    expect(advancedComposition(few, 1e-6).eps).toBeGreaterThan(basicComposition(few).eps);
  });

  it('carries δ′ into the total δ', () => {
    const r = advancedComposition(spends(10, 0.1, 1e-9), 1e-6);
    expect(r.delta).toBeCloseTo(1e-6 + 10e-9, 15);
  });

  it('rejects a δ′ outside (0,1)', () => {
    expect(() => advancedComposition(spends(3, 0.1), 0)).toThrow();
    expect(() => advancedComposition(spends(3, 0.1), 1)).toThrow();
  });

  it('handles heterogeneous spends', () => {
    const mixed: Spend[] = [
      { eps: 0.1, delta: 0, label: 'a' },
      { eps: 0.9, delta: 0, label: 'b' },
    ];
    // Σεᵢ² = 0.82, not (Σεᵢ)² = 1 — the heterogeneous form is not the
    // homogeneous one with the mean substituted in.
    const expected = Math.sqrt(2 * Math.log(1e6) * 0.82) + 0.1 * Math.expm1(0.1) + 0.9 * Math.expm1(0.9);
    expect(advancedComposition(mixed, 1e-6).eps).toBeCloseTo(expected, 12);
  });
});

describe('bestComposition', () => {
  it('picks whichever rule is cheaper, and says which', () => {
    expect(bestComposition(spends(2, 0.5), 1e-6).rule).toBe('basic');
    expect(bestComposition(spends(1000, 0.01), 1e-6).rule).toBe('advanced');
  });

  it('finds the crossover somewhere in between', () => {
    const rules = [1, 5, 20, 100, 500].map((k) => bestComposition(spends(k, 0.05), 1e-6).rule);
    expect(rules[0]).toBe('basic');
    expect(rules[rules.length - 1]).toBe('advanced');
  });
});

describe('Ledger — fail-closed', () => {
  it('admits spends up to the budget', () => {
    const l = new Ledger(1);
    expect(l.request({ eps: 0.4, delta: 0, label: 'a' })).not.toBeNull();
    expect(l.request({ eps: 0.4, delta: 0, label: 'b' })).not.toBeNull();
    expect(l.state().charged.eps).toBeCloseTo(0.8, 12);
  });

  it('refuses a spend that would exceed the budget, and does not record it', () => {
    // The invariant: an over-budget release cannot be taken back, so it must
    // never be made. Refusal is the only correct answer — not "answer anyway
    // with a warning", not "answer with extra noise".
    const l = new Ledger(1);
    l.request({ eps: 0.6, delta: 0, label: 'a' });
    const before = l.state().charged.eps;
    expect(l.request({ eps: 0.6, delta: 0, label: 'b' })).toBeNull();
    expect(l.state().charged.eps).toBe(before);
    expect(l.spends).toHaveLength(1);
  });

  it('reports both rules and charges the cheaper one', () => {
    const l = new Ledger(100);
    for (let i = 0; i < 200; i++) l.request({ eps: 0.02, delta: 0, label: `q${i}` });
    const s = l.state();
    expect(s.basic.eps).toBeCloseTo(4, 9);
    expect(s.advanced).not.toBeNull();
    expect(s.charged.eps).toBeLessThanOrEqual(s.basic.eps);
    expect(s.charged.eps).toBe(Math.min(s.basic.eps, s.advanced!.eps));
  });

  it('reports exhaustion and clears on reset', () => {
    const l = new Ledger(0.5);
    l.request({ eps: 0.5, delta: 0, label: 'a' });
    expect(l.state().exhausted).toBe(true);
    expect(l.state().remaining).toBeCloseTo(0, 12);
    l.reset();
    expect(l.state().exhausted).toBe(false);
    expect(l.state().charged.eps).toBe(0);
  });

  it('quotes without spending', () => {
    const l = new Ledger(10);
    const quoted = l.quote({ eps: 1, delta: 0, label: 'x' });
    expect(quoted.eps).toBeCloseTo(1, 12);
    expect(l.spends).toHaveLength(0);
  });
});
