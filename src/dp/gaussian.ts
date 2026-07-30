/**
 * Calibrating the Gaussian mechanism, two ways.
 *
 * The Gaussian mechanism cannot give pure ε-DP: a Gaussian's tails fall faster
 * than any exponential, so the likelihood ratio between neighbouring answers
 * grows without bound out in the tail. (ε, δ)-DP is the repair — δ is a budget
 * for the outcomes where the e^ε promise is allowed to fail. Exhibit 2 draws
 * that unbounded ratio next to Laplace's flat ceiling; this file computes the
 * numbers underneath it.
 */
import { normalCdf } from './normal';

/**
 * The classic textbook calibration (Dwork & Roth, Theorem A.1):
 * σ = Δ·√(2·ln(1.25/δ))/ε, valid only for ε < 1.
 *
 * It is a sufficient condition derived from a tail bound, not the exact answer,
 * and it is loose — usually by 10–20%, and much worse as ε approaches 1.
 */
export function classicSigma(sensitivity: number, eps: number, delta: number): number {
  if (!(eps > 0) || !(delta > 0 && delta < 1)) throw new RangeError('need ε > 0 and δ ∈ (0,1)');
  return (sensitivity * Math.sqrt(2 * Math.log(1.25 / delta))) / eps;
}

/**
 * The exact δ of the Gaussian mechanism at a given σ (Balle & Wang, ICML 2018,
 * Theorem 8):
 *
 *   δ(ε, σ) = Φ(Δ/2σ − εσ/Δ) − e^ε·Φ(−Δ/2σ − εσ/Δ)
 *
 * This is an equality, not a bound, and it holds for every ε > 0 rather than
 * only ε < 1.
 */
export function analyticDelta(sensitivity: number, eps: number, sigma: number): number {
  if (!(sigma > 0)) throw new RangeError('need σ > 0');
  const a = sensitivity / (2 * sigma);
  const b = (eps * sigma) / sensitivity;
  return normalCdf(a - b) - Math.exp(eps) * normalCdf(-a - b);
}

/**
 * The smallest σ meeting a target δ, by bisection on the exact δ above.
 * δ is strictly decreasing in σ, so the bracket is unambiguous.
 */
export function analyticSigma(sensitivity: number, eps: number, delta: number): number {
  if (!(delta > 0 && delta < 1)) throw new RangeError('need δ ∈ (0,1)');
  let lo = 1e-12 * sensitivity;
  let hi = Math.max(sensitivity, 1) * 1e6;
  // Widen if the target δ is extreme enough that the default bracket misses it.
  for (let i = 0; i < 200 && analyticDelta(sensitivity, eps, hi) > delta; i++) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (analyticDelta(sensitivity, eps, mid) > delta) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The likelihood ratio the definition actually cares about, for a Gaussian
 * shifted by the sensitivity: Pr[M(D) = x] / Pr[M(D′) = x] at output x.
 * Returned as a natural log, because it runs off the top of a linear axis.
 */
export function gaussianLogRatio(sensitivity: number, sigma: number, x: number, centre: number): number {
  const d = x - centre;
  return (sensitivity * (2 * d - sensitivity)) / (2 * sigma * sigma);
}

/** Density of N(centre, σ²). */
export function gaussianPdf(sigma: number, centre: number, x: number): number {
  const z = (x - centre) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}
