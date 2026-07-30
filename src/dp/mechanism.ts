/**
 * Turning a true answer into a released one.
 *
 * A mechanism here is a triple: which noise distribution, how much of it (from
 * ε and the query's sensitivity), and — for anything that is not already
 * integer-valued at Δ = 1 — what lattice the released answer lives on.
 *
 * That last part is the piece most write-ups leave out, and getting it wrong
 * silently destroys the guarantee. The exact samplers live on ℤ. To release a
 * total payroll with Δ = $250,000 on ℤ we would need ~Δ/ε geometric trials per
 * draw, which is minutes, not milliseconds. So the answer is released on a
 * coarser lattice of `grid` dollars — and the true answer is *rounded onto that
 * lattice first*. If it were not, the two neighbouring databases would put their
 * outputs on two different lattices, the supports would be disjoint, and the
 * likelihood ratio would be infinite rather than e^ε: no privacy at all, from a
 * step that looks like a rendering detail.
 *
 * Rounding costs one grid step of sensitivity (two nearby reals can round to
 * lattice points one step further apart than they started), so the per-step
 * privacy parameter is ε/(gridSteps + 1) rather than ε/gridSteps. Conservative
 * on purpose: the released answer is slightly noisier than strictly required,
 * never slightly less private.
 *
 * The lattice is a consequence of the *sampler*, not of the query, so the two
 * modes that do not use an integer sampler — the exact answer and the textbook
 * continuous Laplace — do not snap to it. That matters in Exhibit 1: an "exact"
 * answer that had been quietly rounded to the nearest $5,000 would have made
 * the differencing attack recover $140,000 instead of Alice's actual $142,000,
 * and the demo would have taught a rounding artefact as if it were the attack.
 */
import { sampleDiscreteGaussian, sampleDiscreteLaplace } from './discrete';
import { analyticSigma } from './gaussian';
import { sampleContinuousLaplace, uniformDouble } from './laplace';
import { div, rat, toNumber, type Rational } from './rational';
import type { Rng } from './rng';

export type MechanismKind = 'discrete-laplace' | 'discrete-gaussian' | 'continuous-laplace' | 'exact';

export const MECHANISM_LABELS: Record<MechanismKind, string> = {
  'discrete-laplace': 'Discrete Laplace (exact)',
  'discrete-gaussian': 'Discrete Gaussian (exact)',
  'continuous-laplace': 'Continuous Laplace (textbook, floats)',
  exact: 'No noise — the exact answer',
};

export interface MechanismSpec {
  readonly kind: MechanismKind;
  /** The privacy parameter, exact. */
  readonly eps: Rational;
  /** Only used by the Gaussian; pure ε mechanisms have δ = 0. */
  readonly delta: number;
  /** Δ: what one person can move this query's answer by. */
  readonly sensitivity: number;
  /** How many lattice steps Δ spans. 1 for an integer query with Δ = 1. */
  readonly gridSteps: number;
}

export interface Lattice {
  /** The spacing of released answers, in the query's own units. */
  readonly grid: number;
  /** The worst-case gap, in lattice steps, between neighbouring databases. */
  readonly shift: number;
  /** The per-lattice-step privacy parameter handed to the sampler. */
  readonly gamma: Rational;
  /** True when the true answer had to be rounded onto the lattice. */
  readonly rounds: boolean;
}

export function lattice(spec: MechanismSpec): Lattice {
  const grid = spec.sensitivity / spec.gridSteps;
  const rounds = grid !== 1;
  const shift = rounds ? spec.gridSteps + 1 : spec.sensitivity;
  return { grid, shift, rounds, gamma: div(spec.eps, rat(shift)) };
}

export interface Release {
  readonly trueValue: number;
  /** The true value snapped onto the release lattice. */
  readonly latticeValue: number;
  readonly noise: number;
  readonly value: number;
  readonly spec: MechanismSpec;
  readonly lattice: Lattice;
  /** Laplace scale b = Δ/ε, or the Gaussian σ, in the query's own units. */
  readonly scale: number;
}

/** b = Δ/ε, the scale of the Laplace noise in the query's own units. */
export function laplaceScale(spec: MechanismSpec): number {
  return spec.sensitivity / toNumber(spec.eps);
}

/** σ for the Gaussian mechanism at this (ε, δ), in the query's own units. */
export function gaussianSigma(spec: MechanismSpec): number {
  return analyticSigma(spec.sensitivity, toNumber(spec.eps), spec.delta);
}

/**
 * σ² as an exact rational in *lattice steps*, rounded up to the next 1/10000 so
 * the sampled σ is never smaller than the calibrated one.
 */
function sigmaSquaredRational(spec: MechanismSpec, lat: Lattice): Rational {
  const sigmaSteps = gaussianSigma(spec) / lat.grid;
  const v = sigmaSteps * sigmaSteps;
  return rat(BigInt(Math.ceil(v * 10_000)), 10_000n);
}

/** Only the exact integer samplers need the answer snapped onto a lattice. */
function usesLattice(kind: MechanismKind): boolean {
  return kind === 'discrete-laplace' || kind === 'discrete-gaussian';
}

export function release(rng: Rng, spec: MechanismSpec, trueValue: number): Release {
  const lat = lattice(spec);
  const snap = lat.rounds && usesLattice(spec.kind);
  const latticeValue = snap ? Math.round(trueValue / lat.grid) * lat.grid : trueValue;

  let noise: number;
  let scale: number;
  switch (spec.kind) {
    case 'exact':
      noise = 0;
      scale = 0;
      break;
    case 'discrete-laplace':
      noise = lat.grid * sampleDiscreteLaplace(rng, lat.gamma);
      scale = laplaceScale(spec);
      break;
    case 'discrete-gaussian':
      noise = lat.grid * sampleDiscreteGaussian(rng, sigmaSquaredRational(spec, lat));
      scale = gaussianSigma(spec);
      break;
    case 'continuous-laplace':
      scale = laplaceScale(spec);
      noise = sampleContinuousLaplace(scale, () => uniformDouble(() => rng.nextUint32()));
      break;
  }

  return { trueValue, latticeValue, noise, value: latticeValue + noise, spec, lattice: lat, scale };
}

/**
 * The attacker's belief after seeing one release, in the worst case the
 * definition allows.
 *
 * ε-DP says the likelihood ratio between "Alice is in the database" and "she is
 * not" is at most e^ε for *every* output. Bayes turns that straight into a
 * bound on belief: a prior of π can move to at most π·e^ε / (π·e^ε + 1 − π).
 * This is the sentence that makes ε mean something — it is not "how much noise",
 * it is "how much anyone can learn about you".
 */
export function worstCasePosterior(prior: number, eps: number): number {
  const l = prior * Math.exp(eps);
  return l / (l + (1 - prior));
}
