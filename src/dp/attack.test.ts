import { describe, expect, it } from 'vitest';
import { averagingAttack, differencingAttack } from './attack';
import { EMPLOYEES, sumSalary, TARGET_ID, target } from './database';
import { lattice, type MechanismSpec } from './mechanism';
import { epsAt, EPS_LADDER } from './params';
import { seededRng } from './rng';

const spec = (eps: string, kind: MechanismSpec['kind'] = 'discrete-laplace'): MechanismSpec => ({
  kind,
  eps: epsAt(EPS_LADDER.indexOf(eps)),
  delta: 0,
  sensitivity: sumSalary.sensitivity,
  gridSteps: 50,
});

describe('the differencing attack', () => {
  it('recovers one person\'s salary to the dollar when the answers are exact', () => {
    // Two aggregates over twelve people, neither of which names anyone, and the
    // subtraction is one person's pay. This is the failure DP was defined against.
    const rng = seededRng(61);
    for (let i = 0; i < 10; i++) {
      const r = differencingAttack(rng, spec('1', 'exact'), EMPLOYEES, TARGET_ID);
      expect(r.recovered).toBe(target().salary);
      expect(r.exact).toBe(true);
      expect(r.error).toBe(0);
    }
  });

  it('fails once the same two answers carry noise', () => {
    const rng = seededRng(62);
    const trials = 60;
    let exactHits = 0;
    const errors: number[] = [];
    for (let i = 0; i < trials; i++) {
      const r = differencingAttack(rng, spec('1'), EMPLOYEES, TARGET_ID);
      if (r.exact) exactHits++;
      errors.push(Math.abs(r.error));
    }
    expect(exactHits).toBeLessThan(trials / 4);
    errors.sort((a, b) => a - b);
    // Two independent Laplace draws at b = Δ/ε = 250,000 swamp a $142,000 salary.
    expect(errors[Math.floor(trials / 2)]).toBeGreaterThan(50_000);
  });

  it('gets worse as ε shrinks', () => {
    const rms = (eps: string): number => {
      const rng = seededRng(63);
      let acc = 0;
      const trials = 40;
      for (let i = 0; i < trials; i++) {
        acc += differencingAttack(rng, spec(eps), EMPLOYEES, TARGET_ID).error ** 2;
      }
      return Math.sqrt(acc / trials);
    };
    expect(rms('0.1')).toBeGreaterThan(rms('5'));
  });

  it('still reports the truth it was measured against', () => {
    const rng = seededRng(64);
    const r = differencingAttack(rng, spec('1'), EMPLOYEES, TARGET_ID);
    expect(r.truth).toBe(target().salary);
    expect(r.recovered - r.truth).toBe(r.error);
  });
});

describe('the averaging attack', () => {
  it('converges on the true answer at the rate the theory predicts', () => {
    // Independent noise averages away at 1/√n. This is why a budget has to be
    // spent rather than merely displayed: without composition accounting, an
    // analyst re-asks the same question and the privacy simply evaporates.
    const rng = seededRng(71);
    const trueValue = sumSalary.run(EMPLOYEES);
    const r = averagingAttack(rng, spec('0.5'), trueValue, 2_000, 0.5);
    expect(r.finalAbsError).toBeLessThan(4 * r.predictedStdDev);
    expect(r.epsSpent).toBeCloseTo(1_000, 9);
  });

  it('is far more accurate at n = 2000 than at n = 1', () => {
    const rng = seededRng(72);
    const trueValue = sumSalary.run(EMPLOYEES);
    const r = averagingAttack(rng, spec('0.5'), trueValue, 2_000, 0.5);
    const first = r.steps[0];
    const last = r.steps[r.steps.length - 1];
    expect(last.absError).toBeLessThan(first.absError);
    expect(last.n).toBe(2_000);
  });

  it('reports a spend that grows linearly with the number of questions', () => {
    const rng = seededRng(73);
    const r = averagingAttack(rng, spec('0.5'), 1_240_000, 200, 0.5, 10);
    for (const s of r.steps) expect(s.epsSpent).toBeCloseTo(s.n * 0.5, 9);
    expect(r.steps.length).toBeLessThanOrEqual(12);
  });

  it('shrinks the error roughly as 1/√n', () => {
    const rng = seededRng(74);
    const trueValue = 1_240_000;
    const errAt = (n: number): number => {
      // Averaged over repeats so the comparison is between distributions, not
      // between two individual draws.
      let acc = 0;
      for (let i = 0; i < 12; i++) {
        acc += averagingAttack(rng, spec('1'), trueValue, n, 1, 1).finalAbsError;
      }
      return acc / 12;
    };
    expect(errAt(400)).toBeLessThan(errAt(25) * 0.6);
  });

  it('releases on the lattice the mechanism advertises', () => {
    const rng = seededRng(75);
    const grid = lattice(spec('1')).grid;
    const r = averagingAttack(rng, spec('1'), 1_240_000, 1, 1, 1);
    expect(r.steps[0].estimate % grid).toBe(0);
  });
});
