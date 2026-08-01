/**
 * The definition itself, computed rather than asserted.
 *
 * ε-differential privacy says: for every pair of databases differing in one
 * person, and every possible output x,
 *
 *   Pr[M(D) = x] ≤ e^ε · Pr[M(D′) = x]
 *
 * Exhibit 2 draws that inequality. This module produces the two distributions
 * and their pointwise ratio, so the page can show the ratio pressing up against
 * the e^ε ceiling and stopping there — and, for the Gaussian, show it sailing
 * straight through, which is the entire reason δ exists.
 */
import { discreteGaussianPmf, discreteLaplacePmf } from './discrete';

export interface RatioPoint {
  /** The released value. */
  readonly x: number;
  /** Pr[M(D) = x], where D contains the target record. */
  readonly withTarget: number;
  /** Pr[M(D′) = x], where D′ does not. */
  readonly withoutTarget: number;
  /** The larger of the two one-sided ratios — the quantity ε has to bound. */
  readonly ratio: number;
}

export interface RatioCurve {
  readonly points: readonly RatioPoint[];
  /** The largest ratio anywhere on the support we examined. */
  readonly maxRatio: number;
  /** e^ε — the ceiling the definition promises. */
  readonly ceiling: number;
  /** Whether every examined output honoured the ceiling. */
  readonly holds: boolean;
  /**
   * The exact δ this mechanism needs at this ε: δ = Σₓ (Pr[M(D) = x] − e^ε·Pr[M(D′) = x])₊,
   * maximised over the two directions.
   *
   * That sum is not an approximation of δ — it *is* δ, because the worst output
   * set S is exactly the set of outputs where the ε promise fails, and the
   * excess adds up over them. Zero for a pure ε mechanism; for the Gaussian it
   * is the reason δ appears in the definition at all.
   */
  readonly deltaNeeded: number;
}

export type PmfKind = 'laplace' | 'gaussian';

export interface CurveSpec {
  readonly kind: PmfKind;
  /** Discrete Laplace: γ per lattice step. Gaussian: σ in lattice steps. */
  readonly param: number;
  /** Where D puts the true answer, in lattice steps. */
  readonly centre: number;
  /** How far D′ moves it, in lattice steps. */
  readonly shift: number;
  readonly eps: number;
  readonly lo: number;
  readonly hi: number;
}

/**
 * ln( Pr[M(D) = x] / Pr[M(D′) = x] ) — the quantity ε bounds, in the form that
 * actually draws well.
 *
 * The plain ratio is a poor picture for the Laplace mechanism: with a shift of
 * one lattice step there is no integer strictly between the two true answers,
 * so the ratio is e^ε at *every* output and the curve lies exactly on its own
 * ceiling. The signed log ratio shows what is really happening — a step from
 * −ε to +ε, saturating immediately and never going further — and it puts the
 * Gaussian's unbounded straight line on the same axis for comparison.
 *
 * Computed in closed form rather than as a quotient of two probabilities, which
 * underflows to 0/0 out in the tail where the Gaussian gets interesting.
 */
export function logRatio(spec: CurveSpec, x: number): number {
  const d = x - spec.centre;
  const e = x - (spec.centre - spec.shift);
  return spec.kind === 'laplace'
    ? spec.param * (Math.abs(e) - Math.abs(d))
    : (e * e - d * d) / (2 * spec.param * spec.param);
}

function pmf(spec: CurveSpec, x: number, centre: number): number {
  return spec.kind === 'laplace'
    ? discreteLaplacePmf(spec.param, x - centre)
    : discreteGaussianPmf(spec.param, x - centre);
}

export function ratioCurve(spec: CurveSpec): RatioCurve {
  const points: RatioPoint[] = [];
  const ceiling = Math.exp(spec.eps);
  let maxRatio = 0;
  let excessA = 0;
  let excessB = 0;
  for (let x = spec.lo; x <= spec.hi; x++) {
    const a = pmf(spec, x, spec.centre);
    const b = pmf(spec, x, spec.centre - spec.shift);
    // The definition is symmetric in D and D′, so the quantity ε must bound is
    // the larger of the two directions.
    //
    // Taken from the closed-form log ratio rather than from the quotient a/b.
    // Both PMFs underflow to exactly 0 out in the tail — at ε = 10 that happens
    // about 75 lattice steps out, comfortably inside the range Exhibit 2
    // examines — and the quotient then evaluates to 0/0 or x/0, so `maxRatio`
    // came back Infinity and `holds` came back false for a mechanism that meets
    // its ε with equality. The exponent is a difference of magnitudes and never
    // underflows, so this route agrees with the quotient wherever the quotient
    // is defined and is still right where it is not.
    const ratio = Math.exp(Math.abs(logRatio(spec, x)));
    points.push({ x, withTarget: a, withoutTarget: b, ratio });
    if (ratio > maxRatio) maxRatio = ratio;
    excessA += Math.max(0, a - ceiling * b);
    excessB += Math.max(0, b - ceiling * a);
  }
  return {
    points,
    maxRatio,
    ceiling,
    holds: maxRatio <= ceiling * (1 + 1e-9),
    deltaNeeded: Math.max(excessA, excessB),
  };
}

/**
 * The best any attacker can do at distinguishing D from D′ from one release,
 * given an equal prior — the operational meaning of ε.
 *
 * Total variation distance between the two output distributions; the optimal
 * guesser is right with probability (1 + TV)/2. This is what the guessing game
 * in Exhibit 2 measures empirically, and it is the number the tally converges to.
 */
export function optimalGuessRate(spec: CurveSpec): number {
  let tv = 0;
  for (let x = spec.lo; x <= spec.hi; x++) {
    tv += Math.abs(pmf(spec, x, spec.centre) - pmf(spec, x, spec.centre - spec.shift));
  }
  return (1 + tv / 2) / 2;
}
