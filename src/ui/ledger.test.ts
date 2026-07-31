import { beforeEach, describe, expect, it, vi } from 'vitest';
import { charge, DEFAULT_BUDGET, onLedgerChange, quote, resetLedger, sessionLedger, setBudget } from './ledger';

beforeEach(() => {
  setBudget(DEFAULT_BUDGET);
});

const ask = (eps: number) => charge({ eps, delta: 0, label: 'test query' });

describe('the session ledger', () => {
  it('is one ledger, so a quote from one panel sees another panel’s spending', () => {
    const before = quote(0.5, 'q').total;
    ask(0.5);
    expect(quote(0.5, 'q').total).toBeGreaterThan(before);
  });

  it('refuses rather than answering once the budget is gone', () => {
    expect(ask(0.5)).not.toBeNull();
    expect(ask(0.5)).not.toBeNull();
    expect(ask(0.5)).not.toBeNull();
    // 1.5 spent against a 1.5 budget: exhausted, and the next request has to
    // return null rather than a smaller charge.
    expect(sessionLedger().state().exhausted).toBe(true);
    expect(ask(0.35)).toBeNull();
  });

  it('does not charge for a refused request', () => {
    for (let i = 0; i < 3; i++) ask(0.5);
    const spent = sessionLedger().state().charged.eps;
    ask(5);
    expect(sessionLedger().state().charged.eps).toBe(spent);
    expect(sessionLedger().state().spends).toHaveLength(3);
  });
});

describe('quote', () => {
  it('predicts a refusal without spending anything', () => {
    const q = quote(99, 'enormous');
    expect(q.wouldRefuse).toBe(true);
    expect(sessionLedger().state().spends).toHaveLength(0);
    expect(sessionLedger().state().charged.eps).toBe(0);
  });

  it('reports the total the ledger would reach, not the increment', () => {
    ask(0.5);
    const q = quote(0.35, 'next');
    expect(q.total).toBeCloseTo(0.85, 10);
    expect(q.budget).toBe(DEFAULT_BUDGET);
  });

  it('names the rule that would be billed', () => {
    expect(['basic', 'advanced']).toContain(quote(0.1, 'q').rule);
  });
});

describe('notification', () => {
  it('tells subscribers when a charge, a reset or a budget change lands', () => {
    const seen = vi.fn();
    const off = onLedgerChange(seen);
    ask(0.5);
    resetLedger();
    setBudget(3);
    expect(seen).toHaveBeenCalledTimes(3);
    off();
    ask(0.5);
    expect(seen).toHaveBeenCalledTimes(3);
  });

  it('does not notify for a quote, which changes nothing', () => {
    const seen = vi.fn();
    const off = onLedgerChange(seen);
    quote(0.5, 'q');
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

describe('resetting and re-budgeting', () => {
  it('clears the spends on reset but keeps the budget', () => {
    ask(0.5);
    resetLedger();
    expect(sessionLedger().state().spends).toHaveLength(0);
    expect(sessionLedger().budget).toBe(DEFAULT_BUDGET);
  });

  it('starts a fresh ledger when the budget changes', () => {
    ask(0.5);
    setBudget(10);
    expect(sessionLedger().budget).toBe(10);
    expect(sessionLedger().state().spends).toHaveLength(0);
  });
});
