/**
 * Contribution bounding: where real differential privacy deployments fail.
 *
 * Sampling Laplace noise is the part everyone implements and the part almost
 * nobody gets wrong. The failures happen one step earlier, in the query
 * definition: what is one person allowed to contribute, who decided, and did
 * that decision look at the data?
 *
 * A sum has no sensitivity at all until somebody declares a range. Δ does not
 * come from the database — it comes from a bound written down in advance, and
 * every record is clamped to it before the sum is taken. That declaration is a
 * real choice with a real cost on both sides, and this module computes both:
 *
 * - Declare a high bound and Δ is large, so the noise is large and the answer
 *   is useless.
 * - Declare a low bound and the noise is small, but every record above it is
 *   clipped, so the answer is *biased* — systematically low, by an amount that
 *   no amount of averaging will remove.
 *
 * The third option is the one that must never be taken: set the bound from the
 * observed maximum. It looks like the responsible choice — nothing gets clipped,
 * no bias — and it destroys the guarantee, because Δ is then a function of the
 * data, the noise scale is a function of the data, and the released answer
 * carries information about the very record it was supposed to hide. A database
 * whose top earner makes $480,000 produces a visibly different noise scale from
 * one whose top earner makes $150,000, and an attacker reads the difference.
 * `isPrivateCalibration` exists to say so in code rather than in a comment.
 */
import { EMPLOYEES, type Employee } from './database';

/**
 * The thirteenth hire, added only for this exercise: an executive whose salary
 * is above the range the analyst declared. Kept out of `EMPLOYEES` so that every
 * other number on the page still refers to the same twelve records.
 */
export const LATE_HIRE: Employee = {
  id: 13,
  name: 'Mara Kowalski',
  dept: 'Executive',
  age: 47,
  zip: '98107',
  salary: 480_000,
};

export const PAYROLL_WITH_LATE_HIRE: readonly Employee[] = [...EMPLOYEES, LATE_HIRE];

/** Upper bounds the exercise offers. The lower bound is 0 throughout. */
export const BOUND_CHOICES: readonly number[] = [100_000, 150_000, 250_000, 500_000];

export interface ClampAnalysis {
  readonly hi: number;
  /** Δ = hi − lo. One person clamped to [0, hi] can move the sum by at most hi. */
  readonly sensitivity: number;
  /** b = Δ/ε, the Laplace scale, which is also the mean absolute noise. */
  readonly noiseScale: number;
  readonly trueSum: number;
  readonly clampedSum: number;
  readonly clippedCount: number;
  /** How much the clamp removes from the answer, before any noise. Never negative. */
  readonly clipBias: number;
  /**
   * A rough budget for how wrong the released answer is: the deterministic
   * shortfall from clipping plus the typical magnitude of the noise. The two
   * are different in kind — bias does not average away and noise does — so this
   * is a comparison aid, not an error bar, and the UI labels it as one.
   */
  readonly totalTypicalError: number;
}

export function analyseClamp(db: readonly Employee[], hi: number, eps: number): ClampAnalysis {
  if (!(hi > 0)) throw new RangeError('the declared upper bound must be positive');
  if (!(eps > 0)) throw new RangeError('ε must be positive');
  const trueSum = db.reduce((acc, e) => acc + e.salary, 0);
  const clampedSum = db.reduce((acc, e) => acc + Math.min(hi, Math.max(0, e.salary)), 0);
  const clippedCount = db.filter((e) => e.salary > hi).length;
  const noiseScale = hi / eps;
  const clipBias = trueSum - clampedSum;
  return {
    hi,
    sensitivity: hi,
    noiseScale,
    trueSum,
    clampedSum,
    clippedCount,
    clipBias,
    totalTypicalError: clipBias + noiseScale,
  };
}

/** What to do about a record above the declared bound. */
export type OutOfRangeChoice = 'clip' | 'reject' | 'expand';

export interface DecisionAnalysis {
  readonly choice: OutOfRangeChoice;
  /**
   * Whether the resulting mechanism is still differentially private at the
   * stated ε. Only `expand` fails, and it fails completely rather than by a
   * degree — there is no ε at which a data-dependent Δ is calibrated.
   */
  readonly private: boolean;
  /** Δ actually used, in dollars. */
  readonly sensitivity: number;
  /** The answer the mechanism computes before noise. */
  readonly preNoiseAnswer: number;
  /** Systematic shortfall against the true total. */
  readonly bias: number;
}

export function analyseDecision(
  db: readonly Employee[],
  declaredHi: number,
  choice: OutOfRangeChoice,
): DecisionAnalysis {
  const trueSum = db.reduce((acc, e) => acc + e.salary, 0);
  switch (choice) {
    case 'clip': {
      const answer = db.reduce((acc, e) => acc + Math.min(declaredHi, Math.max(0, e.salary)), 0);
      return { choice, private: true, sensitivity: declaredHi, preNoiseAnswer: answer, bias: trueSum - answer };
    }
    case 'reject': {
      // Dropping records above a bound that was declared in advance is a
      // deterministic, data-independent rule, so the mechanism is still private
      // at Δ = declaredHi. The cost is not privacy — it is that the released
      // number now describes a different population than the one asked about.
      const kept = db.filter((e) => e.salary <= declaredHi);
      const answer = kept.reduce((acc, e) => acc + e.salary, 0);
      return { choice, private: true, sensitivity: declaredHi, preNoiseAnswer: answer, bias: trueSum - answer };
    }
    case 'expand': {
      // Δ is now max(salary): a function of the data, and therefore a leak.
      const observedMax = db.reduce((acc, e) => Math.max(acc, e.salary), 0);
      return { choice, private: false, sensitivity: observedMax, preNoiseAnswer: trueSum, bias: 0 };
    }
  }
}

/**
 * Whether a proposed Δ is a legitimate calibration.
 *
 * The test is not "is the number big enough" — a Δ read off the observed
 * maximum is always big enough, and always wrong. It is "was this number a
 * function of the data", which is why the argument is the provenance and not
 * the value.
 */
export function isPrivateCalibration(source: 'declared' | 'observed-maximum'): boolean {
  return source === 'declared';
}

/**
 * The bound with the smallest combined bias-plus-noise, for a given ε.
 *
 * Deliberately not shown in the UI. Printing "the best bound" would hand the
 * learner the answer to the decision the exercise exists to make them take, and
 * would imply the choice is an optimisation rather than an argument — the same
 * mistake as implying there is a universally good ε. It is here so the test
 * suite can assert that the winning bound actually *changes* with ε, because an
 * exercise whose answer never moves is not a decision.
 */
export function bestBoundFor(db: readonly Employee[], eps: number): ClampAnalysis {
  const analyses = BOUND_CHOICES.map((hi) => analyseClamp(db, hi, eps));
  return analyses.reduce((best, a) => (a.totalTypicalError < best.totalTypicalError ? a : best));
}
