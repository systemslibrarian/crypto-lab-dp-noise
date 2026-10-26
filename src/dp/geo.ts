/**
 * Geo-indistinguishability on a local Euclidean plane.
 *
 * Andrés et al. (CCS 2013 / arXiv:1212.1984), Definition 3.1 and §4,
 * instantiate metric differential privacy with distance measured on R².  For
 * ε in km⁻¹ the ideal planar Laplace density about x is
 *
 *   ε²/(2π) · exp(-ε d(x,z)).
 *
 * The sampler below is deliberately labelled as a floating-point teaching
 * implementation.  The paper's §4.2 digital mechanism has an additional
 * finite-precision calibration; this module does not claim to implement it.
 */
import { uniformDouble } from './laplace';
import type { Rng } from './rng';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PlanarDraw {
  readonly point: Point;
  readonly radius: number;
  readonly angle: number;
}

export interface GridAudit {
  readonly maxAbsLogRatio: number;
  readonly signedLogRatio: number;
  readonly witness: Point;
  readonly probabilityA: number;
  readonly probabilityB: number;
}

export interface PathInference {
  readonly logLikelihoodAOverB: number;
  readonly favoured: 'A' | 'B' | 'tie';
  readonly posteriorFavoured: number;
}

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

function positive(name: string, value: number): void {
  finite(name, value);
  if (value <= 0) throw new RangeError(`${name} must be greater than zero`);
}

function validEpsilon(epsilon: number): void {
  positive('epsilon', epsilon);
  if (!Number.isFinite(1 / epsilon) || !Number.isFinite(epsilon * epsilon)) {
    throw new RangeError('epsilon is outside this floating-point implementation range');
  }
}

function validPoint(name: string, point: Point): void {
  finite(`${name}.x`, point.x);
  finite(`${name}.y`, point.y);
}

export function euclidean(a: Point, b: Point): number {
  validPoint('first point', a);
  validPoint('second point', b);
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  if (!Number.isFinite(distance)) throw new RangeError('point separation exceeds this floating-point implementation range');
  return distance;
}

export function planarDensity(epsilon: number, origin: Point, output: Point): number {
  validEpsilon(epsilon);
  return (epsilon * epsilon * Math.exp(-epsilon * euclidean(origin, output))) / (2 * Math.PI);
}

/** log(p(z|a)/p(z|b)); the shared normalising constant cancels exactly. */
export function planarPrivacyLoss(epsilon: number, a: Point, b: Point, output: Point): number {
  validEpsilon(epsilon);
  return epsilon * (euclidean(b, output) - euclidean(a, output));
}

export function geoBound(epsilon: number, a: Point, b: Point): number {
  validEpsilon(epsilon);
  return epsilon * euclidean(a, b);
}

/**
 * A point on the ray from b through a and beyond a.  The triangle inequality
 * is tight there, so the A-over-B privacy loss reaches +ε d(a,b).
 */
export function tightPlanarWitness(a: Point, b: Point, extensionKm = 2): Point {
  positive('extension', extensionKm);
  const d = euclidean(a, b);
  if (d === 0) throw new RangeError('the two input locations must differ');
  return {
    x: a.x + ((a.x - b.x) / d) * extensionKm,
    y: a.y + ((a.y - b.y) / d) * extensionKm,
  };
}

/** CDF of radius R for the planar Laplace: 1 - (1 + εr)e^(-εr). */
export function planarRadialCdf(epsilon: number, radius: number): number {
  validEpsilon(epsilon);
  finite('radius', radius);
  if (radius < 0) throw new RangeError('radius must be non-negative');
  const scaled = epsilon * radius;
  if (scaled === Number.POSITIVE_INFINITY) return 1;
  // Equivalent to 1 - (1+s)e^-s, but accurate when s is close to zero.
  return -Math.expm1(-scaled) - scaled * Math.exp(-scaled);
}

/** Invert the radial CDF by monotone bisection; no Lambert-W dependency. */
export function planarRadiusQuantile(epsilon: number, mass: number): number {
  validEpsilon(epsilon);
  finite('mass', mass);
  if (mass < 0 || mass >= 1) throw new RangeError('mass must be in [0, 1)');
  if (mass === 0) return 0;

  let low = 0;
  let high = 1 / epsilon;
  while (planarRadialCdf(epsilon, high) < mass) high *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (planarRadialCdf(epsilon, mid) < mass) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/**
 * Polar sampler: R ~ Gamma(shape=2, scale=1/ε), Θ ~ Uniform[0,2π).
 * Each uniform is a 53-bit double strictly inside (0,1).
 */
export function samplePlanarLaplace(epsilon: number, origin: Point, rng: Rng): PlanarDraw {
  validEpsilon(epsilon);
  validPoint('origin', origin);
  const uniform = (): number => uniformDouble(() => rng.nextUint32());
  const radius = (-Math.log(uniform()) - Math.log(uniform())) / epsilon;
  const angle = 2 * Math.PI * uniform();
  return {
    point: {
      x: origin.x + radius * Math.cos(angle),
      y: origin.y + radius * Math.sin(angle),
    },
    radius,
    angle,
  };
}

export function nearestPointIndex(point: Point, candidates: readonly Point[]): number {
  validPoint('point', point);
  if (candidates.length === 0) throw new RangeError('at least one candidate is required');
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate, index) => {
    const distance = euclidean(point, candidate);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export function squareGrid(radius: number, spacingKm = 1): Point[] {
  if (!Number.isInteger(radius) || radius < 0) throw new RangeError('grid radius must be a non-negative integer');
  positive('grid spacing', spacingKm);
  const points: Point[] = [];
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) points.push({ x: x * spacingKm, y: y * spacingKm });
  }
  return points;
}

function finiteGridLogProbabilities(rate: number, input: Point, outputs: readonly Point[]): number[] {
  positive('rate', rate);
  validPoint('input', input);
  if (outputs.length === 0) throw new RangeError('the output grid must not be empty');
  const logWeights = outputs.map((output) => -rate * euclidean(input, output));
  const max = Math.max(...logWeights);
  if (!Number.isFinite(max)) throw new RangeError('grid weights exceed this floating-point implementation range');
  const shiftedTotal = logWeights.reduce((sum, weight) => sum + Math.exp(weight - max), 0);
  const logNormaliser = max + Math.log(shiftedTotal);
  return logWeights.map((weight) => weight - logNormaliser);
}

/** Normalised finite-grid exponential weights, a separate bounded teaching model. */
export function finiteGridDistribution(rate: number, input: Point, outputs: readonly Point[]): number[] {
  return finiteGridLogProbabilities(rate, input, outputs).map((logProbability) => Math.exp(logProbability));
}

export function auditFiniteGrid(
  rate: number,
  a: Point,
  b: Point,
  outputs: readonly Point[],
): GridAudit {
  const logPa = finiteGridLogProbabilities(rate, a, outputs);
  const logPb = finiteGridLogProbabilities(rate, b, outputs);
  let max = -1;
  let signed = 0;
  let index = 0;
  for (let i = 0; i < outputs.length; i++) {
    const loss = logPa[i]! - logPb[i]!;
    if (Math.abs(loss) > max) {
      max = Math.abs(loss);
      signed = loss;
      index = i;
    }
  }
  return {
    maxAbsLogRatio: max,
    signedLogRatio: signed,
    witness: outputs[index]!,
    probabilityA: Math.exp(logPa[index]!),
    probabilityB: Math.exp(logPb[index]!),
  };
}

function validateTranscript(
  pathA: readonly Point[],
  pathB: readonly Point[],
  releases: readonly Point[],
): void {
  if (pathA.length === 0 || pathA.length !== pathB.length || pathA.length !== releases.length) {
    throw new RangeError('both candidate paths and the release transcript must have the same non-zero length');
  }
}

/** Attacker computation: public candidate paths and released points only. */
export function inferCandidatePath(
  epsilon: number,
  pathA: readonly Point[],
  pathB: readonly Point[],
  releases: readonly Point[],
): PathInference {
  validEpsilon(epsilon);
  validateTranscript(pathA, pathB, releases);
  let logLikelihoodAOverB = 0;
  for (let i = 0; i < releases.length; i++) {
    logLikelihoodAOverB += planarPrivacyLoss(epsilon, pathA[i]!, pathB[i]!, releases[i]!);
  }
  if (!Number.isFinite(logLikelihoodAOverB)) {
    throw new RangeError('transcript likelihood exceeds this floating-point implementation range');
  }
  const magnitude = Math.abs(logLikelihoodAOverB);
  const posteriorFavoured = magnitude > 700 ? 1 : 1 / (1 + Math.exp(-magnitude));
  return {
    logLikelihoodAOverB,
    favoured: logLikelihoodAOverB > 0 ? 'A' : logLikelihoodAOverB < 0 ? 'B' : 'tie',
    posteriorFavoured: logLikelihoodAOverB === 0 ? 0.5 : posteriorFavoured,
  };
}

/** Sum of per-release metric-DP bounds for the two specified candidate paths. */
export function pathTranscriptBound(
  epsilon: number,
  pathA: readonly Point[],
  pathB: readonly Point[],
): number {
  validEpsilon(epsilon);
  if (pathA.length === 0 || pathA.length !== pathB.length) {
    throw new RangeError('candidate paths must have the same non-zero length');
  }
  const bound = pathA.reduce((sum, point, i) => sum + epsilon * euclidean(point, pathB[i]!), 0);
  if (!Number.isFinite(bound)) throw new RangeError('transcript bound exceeds this floating-point implementation range');
  return bound;
}
