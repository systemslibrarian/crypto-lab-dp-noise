/**
 * The textbook continuous Laplace mechanism (Dwork, McSherry, Nissim, Smith,
 * TCC 2006), floats and all.
 *
 * This is here to be *shown*, and to be shown honestly. It is what every
 * introduction to differential privacy writes down, its density is the curve
 * the page draws, and its inverse-CDF sampler is the one nearly every tutorial
 * implements. It is also the one Mironov broke in 2012: `b·ln(u)` over
 * double-precision `u` produces a distribution with gaps and repeated masses
 * whose low bits depend on the true answer, and an attacker who reads enough
 * low bits recovers it. The page therefore labels this mode as the textbook
 * one and defaults to the exact discrete mechanism instead.
 */

/** Density of Laplace(0, b). */
export function laplacePdf(b: number, x: number): number {
  return Math.exp(-Math.abs(x) / b) / (2 * b);
}

/** CDF of Laplace(0, b). */
export function laplaceCdf(b: number, x: number): number {
  return x < 0 ? 0.5 * Math.exp(x / b) : 1 - 0.5 * Math.exp(-x / b);
}

/** Inverse CDF of Laplace(0, b) for p ∈ (0, 1). */
export function laplaceIcdf(b: number, p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError('laplaceIcdf needs p in (0,1)');
  return p < 0.5 ? b * Math.log(2 * p) : -b * Math.log(2 * (1 - p));
}

/** The smallest symmetric interval holding `mass` of Laplace(0, b). */
export function laplaceInterval(b: number, mass: number): number {
  return -b * Math.log(1 - mass);
}

/** Standard deviation of Laplace(0, b): b√2. */
export function laplaceStdDev(b: number): number {
  return b * Math.SQRT2;
}

/**
 * The textbook sampler, floats and all — inverse CDF of a uniform double drawn
 * from the CSPRNG. Deliberately not the page's default; see the file header.
 */
export function sampleContinuousLaplace(b: number, uniform: () => number): number {
  let u = uniform();
  // ln(0) is −∞; the tutorial versions that forget this are the ones that crash.
  while (u <= 0 || u >= 1) u = uniform();
  return laplaceIcdf(b, u);
}

/** A uniform double in (0,1) from 53 CSPRNG bits, for the sampler above. */
export function uniformDouble(nextUint32: () => number): number {
  const hi = nextUint32() >>> 5; // 27 bits
  const lo = nextUint32() >>> 6; // 26 bits
  return (hi * 67108864 + lo + 0.5) / 9007199254740992;
}
