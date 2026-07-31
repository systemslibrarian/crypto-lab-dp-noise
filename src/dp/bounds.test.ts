import { describe, expect, it } from 'vitest';
import {
  analyseClamp,
  analyseDecision,
  bestBoundFor,
  BOUND_CHOICES,
  isPrivateCalibration,
  LATE_HIRE,
  PAYROLL_WITH_LATE_HIRE,
} from './bounds';
import { EMPLOYEES } from './database';

describe('the exercise roster', () => {
  it('leaves the twelve-record database everything else uses untouched', () => {
    expect(EMPLOYEES).toHaveLength(12);
    expect(EMPLOYEES.some((e) => e.id === LATE_HIRE.id)).toBe(false);
  });

  it('adds exactly one person, and one who does not fit the declared bound', () => {
    expect(PAYROLL_WITH_LATE_HIRE).toHaveLength(13);
    // The whole exercise depends on her being above the page's declared clamp
    // and above every offered bound but the largest.
    expect(LATE_HIRE.salary).toBeGreaterThan(250_000);
    expect(BOUND_CHOICES.filter((hi) => LATE_HIRE.salary > hi)).toHaveLength(BOUND_CHOICES.length - 1);
  });
});

describe('analyseClamp', () => {
  it('takes Δ from the declared bound and never from the data', () => {
    for (const hi of BOUND_CHOICES) {
      const a = analyseClamp(PAYROLL_WITH_LATE_HIRE, hi, 1);
      expect(a.sensitivity).toBe(hi);
    }
    // The same bound over a database with a very different maximum must give
    // the same Δ — that is the entire property being taught.
    const withExec = analyseClamp(PAYROLL_WITH_LATE_HIRE, 250_000, 1);
    const withoutExec = analyseClamp(EMPLOYEES, 250_000, 1);
    expect(withExec.sensitivity).toBe(withoutExec.sensitivity);
    expect(withExec.noiseScale).toBe(withoutExec.noiseScale);
  });

  it('scales the noise as Δ/ε', () => {
    expect(analyseClamp(PAYROLL_WITH_LATE_HIRE, 250_000, 0.5).noiseScale).toBe(500_000);
    expect(analyseClamp(PAYROLL_WITH_LATE_HIRE, 250_000, 2).noiseScale).toBe(125_000);
  });

  it('reports the clipping that a low bound causes', () => {
    const tight = analyseClamp(PAYROLL_WITH_LATE_HIRE, 100_000, 1);
    // Six of the twelve originals earn over $100k, plus the late hire.
    expect(tight.clippedCount).toBe(7);
    expect(tight.clipBias).toBeGreaterThan(0);
    expect(tight.clampedSum).toBe(tight.trueSum - tight.clipBias);
  });

  it('clips nobody once the bound covers the highest earner', () => {
    const loose = analyseClamp(PAYROLL_WITH_LATE_HIRE, 500_000, 1);
    expect(loose.clippedCount).toBe(0);
    expect(loose.clipBias).toBe(0);
    expect(loose.clampedSum).toBe(loose.trueSum);
  });

  it('trades bias against noise in opposite directions', () => {
    const analyses = BOUND_CHOICES.map((hi) => analyseClamp(PAYROLL_WITH_LATE_HIRE, hi, 1));
    for (let i = 1; i < analyses.length; i++) {
      expect(analyses[i].noiseScale).toBeGreaterThan(analyses[i - 1].noiseScale);
      expect(analyses[i].clipBias).toBeLessThanOrEqual(analyses[i - 1].clipBias);
    }
  });

  it('makes the best bound depend on ε rather than on the data alone', () => {
    // At a generous ε the noise is cheap, so a bound that clips nothing wins; at
    // a strict ε the noise dominates and a tighter bound is better. If the same
    // bound won at every ε the exercise would have no decision in it.
    const generous = bestBoundFor(PAYROLL_WITH_LATE_HIRE, 10).hi;
    const strict = bestBoundFor(PAYROLL_WITH_LATE_HIRE, 0.01).hi;
    expect(generous).toBeGreaterThan(strict);
  });

  it('refuses a nonsensical bound or ε rather than returning a number', () => {
    expect(() => analyseClamp(PAYROLL_WITH_LATE_HIRE, 0, 1)).toThrow(RangeError);
    expect(() => analyseClamp(PAYROLL_WITH_LATE_HIRE, -1, 1)).toThrow(RangeError);
    expect(() => analyseClamp(PAYROLL_WITH_LATE_HIRE, 250_000, 0)).toThrow(RangeError);
  });
});

describe('analyseDecision', () => {
  const hi = 250_000;

  it('keeps clipping private, at the declared Δ, and reports its bias', () => {
    const d = analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, 'clip');
    expect(d.private).toBe(true);
    expect(d.sensitivity).toBe(hi);
    // Only the part of her salary above the bound is lost.
    expect(d.bias).toBe(LATE_HIRE.salary - hi);
  });

  it('keeps exclusion private, but loses the whole record', () => {
    const d = analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, 'reject');
    expect(d.private).toBe(true);
    expect(d.sensitivity).toBe(hi);
    expect(d.bias).toBe(LATE_HIRE.salary);
    expect(d.bias).toBeGreaterThan(analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, 'clip').bias);
  });

  it('marks expanding the bound as not private, whatever it does to the bias', () => {
    const d = analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, 'expand');
    expect(d.private).toBe(false);
    // It is the *appealing* option: no bias at all. That is exactly why it has
    // to be refused on a ground other than accuracy.
    expect(d.bias).toBe(0);
    expect(d.sensitivity).toBe(LATE_HIRE.salary);
  });

  it('makes the data-dependence of an expanded bound observable', () => {
    // The failure is that Δ moves when the data moves. Two databases differing
    // in one record produce two different noise scales, which is the leak.
    const withHer = analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, 'expand').sensitivity;
    const withoutHer = analyseDecision(EMPLOYEES, hi, 'expand').sensitivity;
    expect(withHer).not.toBe(withoutHer);

    // Neither declared option has that property.
    for (const choice of ['clip', 'reject'] as const) {
      expect(analyseDecision(PAYROLL_WITH_LATE_HIRE, hi, choice).sensitivity).toBe(
        analyseDecision(EMPLOYEES, hi, choice).sensitivity,
      );
    }
  });
});

describe('isPrivateCalibration', () => {
  it('judges a Δ by where it came from, not by how large it is', () => {
    expect(isPrivateCalibration('declared')).toBe(true);
    expect(isPrivateCalibration('observed-maximum')).toBe(false);
  });
});
