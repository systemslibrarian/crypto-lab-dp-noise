/**
 * The two exact discrete mechanisms this page ships: discrete Laplace (the
 * two-sided geometric) and the discrete Gaussian, both after Canonne, Kamath
 * and Steinke, *The Discrete Gaussian for Differential Privacy* (2020).
 *
 * "Discrete" is not a simplification. It is the version whose privacy analysis
 * survives contact with a real computer: every draw is a comparison between
 * exact integers, so the sampled distribution is the analysed distribution, and
 * the floating-point attack of Mironov 2012 has nothing to bite on. The
 * continuous Laplace in `laplace.ts` is offered alongside it for the picture and
 * for the honesty note, not as the default.
 */
import { bernoulliExpNeg, geometricExpNeg, type Rng } from './rng';
import { toNumber, type Rational } from './rational';

/**
 * Discrete Laplace on ℤ with Pr[X = x] ∝ e^(−γ|x|).
 *
 * Sampled as the difference of two independent Geometric(1 − e^−γ) draws, which
 * is exactly the two-sided geometric: summing over the shared offset k gives
 * (1−p)²·Σ p^(2k+|x|) = p^|x|·(1−p)/(1+p). No rejection loop, no floats.
 */
export function sampleDiscreteLaplace(rng: Rng, gamma: Rational): number {
  return geometricExpNeg(rng, gamma.n, gamma.d) - geometricExpNeg(rng, gamma.n, gamma.d);
}

/** Pr[X = x] for the sampler above. Display arithmetic — the sampler itself is exact. */
export function discreteLaplacePmf(gamma: number, x: number): number {
  const p = Math.exp(-gamma);
  return ((1 - p) / (1 + p)) * Math.pow(p, Math.abs(x));
}

/**
 * Discrete Gaussian on ℤ with Pr[X = x] ∝ e^(−x²/2σ²).
 *
 * CKS20 Algorithm 3: propose from a discrete Laplace of scale t = ⌊σ⌋ + 1 and
 * accept with probability exp(−(|Y| − σ²/t)²/2σ²). Both the proposal and the
 * acceptance test are exact rational Bernoullis, so the whole sampler is.
 */
export function sampleDiscreteGaussian(rng: Rng, sigma2: Rational): number {
  const s = sigma2.n;
  const q = sigma2.d;
  const t = BigInt(Math.floor(Math.sqrt(toNumber(sigma2))) + 1);
  const proposalGamma = { n: 1n, d: t } as Rational;
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const y = sampleDiscreteLaplace(rng, proposalGamma);
    // (|y| − s/(q·t))² / (2·s/q) = (|y|·q·t − s)² / (2·s·q·t²)
    const a = BigInt(Math.abs(y)) * q * t - s;
    if (bernoulliExpNeg(rng, a * a, 2n * s * q * t * t)) return y;
  }
  throw new Error('sampleDiscreteGaussian: rejection loop failed to terminate');
}

/**
 * Pr[X = x] for the discrete Gaussian, normalised over a window wide enough
 * that the omitted tail is far below display precision. Used for drawing only.
 */
export function discreteGaussianPmf(sigma: number, x: number): number {
  const half = Math.max(8, Math.ceil(8 * sigma));
  let z = 0;
  for (let k = -half; k <= half; k++) z += Math.exp(-(k * k) / (2 * sigma * sigma));
  return Math.exp(-(x * x) / (2 * sigma * sigma)) / z;
}
