/**
 * Two attacks, both run for real against the same code the rest of the page
 * uses. Nothing here is a re-enactment: the buttons in Exhibits 1 and 4 call
 * these functions, and the numbers they print are what came back.
 */
import { release, type MechanismSpec } from './mechanism';
import type { Rng } from './rng';
import { clampSalary, sumSalary, without, type Employee } from './database';

export interface DifferencingResult {
  /** The released total for the whole payroll. */
  readonly answerAll: number;
  /** The released total for everyone except the target. */
  readonly answerWithout: number;
  /** The attacker's estimate of one person's salary: the difference. */
  readonly recovered: number;
  /** What that person actually earns, as the query sees them (clamped). */
  readonly truth: number;
  readonly error: number;
  /** True when the estimate is the exact salary, to the dollar. */
  readonly exact: boolean;
}

/**
 * The differencing attack.
 *
 * Two aggregates, each averaged over twelve people and each individually
 * unremarkable, subtract to one person's salary. This is why "we only publish
 * aggregates" is not a privacy policy — and it is the attack differential
 * privacy was defined to answer, because no amount of care in choosing *which*
 * aggregates to publish fixes it.
 */
export function differencingAttack(
  rng: Rng,
  spec: MechanismSpec,
  db: readonly Employee[],
  targetId: number,
): DifferencingResult {
  const all = release(rng, spec, sumSalary.run(db));
  const rest = release(rng, spec, sumSalary.run(without(db, targetId)));
  const recovered = all.value - rest.value;
  const truth = clampSalary(db.find((e) => e.id === targetId)?.salary ?? 0);
  return {
    answerAll: all.value,
    answerWithout: rest.value,
    recovered,
    truth,
    error: recovered - truth,
    exact: recovered === truth,
  };
}

export interface AveragingStep {
  readonly n: number;
  readonly estimate: number;
  readonly absError: number;
  /** ε charged so far under basic composition. */
  readonly epsSpent: number;
}

export interface AveragingResult {
  readonly steps: readonly AveragingStep[];
  readonly trueValue: number;
  readonly finalEstimate: number;
  readonly finalAbsError: number;
  readonly epsSpent: number;
  /** b·√2/√n — the standard deviation the averaged estimate should have. */
  readonly predictedStdDev: number;
}

/**
 * The averaging attack: ask the same question n times and take the mean.
 *
 * Independent noise averages out at 1/√n, so an analyst who is allowed to
 * re-ask a question without being charged for it gets the true answer for free.
 * This is the concrete reason composition accounting exists, and the reason a
 * budget must be *spent* rather than merely displayed.
 */
export function averagingAttack(
  rng: Rng,
  spec: MechanismSpec,
  trueValue: number,
  n: number,
  epsPerQuery: number,
  samplePoints = 60,
): AveragingResult {
  const steps: AveragingStep[] = [];
  const every = Math.max(1, Math.floor(n / samplePoints));
  let sum = 0;
  let last = 0;
  for (let i = 1; i <= n; i++) {
    sum += release(rng, spec, trueValue).value;
    last = sum / i;
    if (i === 1 || i === n || i % every === 0) {
      steps.push({ n: i, estimate: last, absError: Math.abs(last - trueValue), epsSpent: i * epsPerQuery });
    }
  }
  const b = spec.sensitivity / epsPerQuery;
  return {
    steps,
    trueValue,
    finalEstimate: last,
    finalAbsError: Math.abs(last - trueValue),
    epsSpent: n * epsPerQuery,
    predictedStdDev: (b * Math.SQRT2) / Math.sqrt(n),
  };
}
