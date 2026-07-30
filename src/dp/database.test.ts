import { describe, expect, it } from 'vitest';
import {
  clampSalary,
  countHighEarners,
  EMPLOYEES,
  headcount,
  HIGH_EARNER_THRESHOLD,
  meanFromReleases,
  queryById,
  SALARY_CLAMP,
  sumSalary,
  TARGET_ID,
  target,
  without,
} from './database';

describe('the toy payroll', () => {
  it('is small enough to check by hand, and its answers are the hand answers', () => {
    expect(EMPLOYEES).toHaveLength(12);
    expect(headcount.run(EMPLOYEES)).toBe(12);
    expect(sumSalary.run(EMPLOYEES)).toBe(1_240_000);
    expect(countHighEarners.run(EMPLOYEES)).toBe(6);
  });

  it('has unique ids', () => {
    expect(new Set(EMPLOYEES.map((e) => e.id)).size).toBe(EMPLOYEES.length);
  });

  it('changes by exactly one person when the target leaves', () => {
    const d2 = without(EMPLOYEES, TARGET_ID);
    expect(d2).toHaveLength(11);
    expect(headcount.run(d2)).toBe(11);
    expect(countHighEarners.run(d2)).toBe(5);
    expect(sumSalary.run(EMPLOYEES) - sumSalary.run(d2)).toBe(target().salary);
  });

  it('leaves the database untouched when building the neighbour', () => {
    without(EMPLOYEES, TARGET_ID);
    expect(EMPLOYEES).toHaveLength(12);
  });

  it('puts the target above the high-earner line, so both queries move', () => {
    expect(target().salary).toBeGreaterThan(HIGH_EARNER_THRESHOLD);
  });
});

describe('sensitivity', () => {
  it('is 1 for both counting queries, for the same reason', () => {
    expect(countHighEarners.sensitivity).toBe(1);
    expect(headcount.sensitivity).toBe(1);
  });

  it('comes from the declared clamp for the sum, not from the data', () => {
    // The number that matters is the *declared* range, not the observed one. A
    // sensitivity read off the data would itself leak the data.
    expect(sumSalary.sensitivity).toBe(SALARY_CLAMP.hi - SALARY_CLAMP.lo);
    const maxObserved = Math.max(...EMPLOYEES.map((e) => e.salary));
    expect(sumSalary.sensitivity).toBeGreaterThan(maxObserved);
  });

  it('is actually bounded by the clamp, for any salary at all', () => {
    for (const s of [-1_000_000, 0, 42, 250_000, 9_999_999]) {
      expect(clampSalary(s)).toBeGreaterThanOrEqual(SALARY_CLAMP.lo);
      expect(clampSalary(s)).toBeLessThanOrEqual(SALARY_CLAMP.hi);
    }
  });

  it('holds for every single record: no one can move the sum by more than Δ', () => {
    for (const e of EMPLOYEES) {
      const gap = sumSalary.run(EMPLOYEES) - sumSalary.run(without(EMPLOYEES, e.id));
      expect(Math.abs(gap)).toBeLessThanOrEqual(sumSalary.sensitivity);
    }
  });

  it('explains itself in words as well as numbers', () => {
    for (const q of [countHighEarners, headcount, sumSalary]) {
      expect(q.sensitivityWhy.length).toBeGreaterThan(20);
    }
  });
});

describe('post-processing', () => {
  it('divides two released numbers without spending anything more', () => {
    // DP is closed under post-processing: the mean is computed from the two
    // noisy releases and costs nothing beyond what they already cost.
    expect(meanFromReleases(1_240_000, 12)).toBeCloseTo(103_333.33, 1);
  });

  it('refuses to divide by a non-positive noisy count', () => {
    expect(Number.isNaN(meanFromReleases(100, 0))).toBe(true);
    expect(Number.isNaN(meanFromReleases(100, -3))).toBe(true);
  });
});

describe('query lookup', () => {
  it('finds every query it advertises and throws on the rest', () => {
    for (const id of ['count-high', 'headcount', 'sum-salary']) {
      expect(queryById(id).id).toBe(id);
    }
    expect(() => queryById('nope')).toThrow();
  });
});
