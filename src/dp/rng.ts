/**
 * Randomness, and the exact Bernoulli primitives every mechanism on this page
 * is built from.
 *
 * Two rules shape this file:
 *
 * 1. **The page's randomness is real.** `cryptoRng` pulls from
 *    `crypto.getRandomValues`. Nothing here uses `Math.random()`, and no noise
 *    anywhere on the page is decorative jitter.
 * 2. **The Bernoulli draws are exact.** A differentially private mechanism is
 *    only as private as its sampler. The classic failure is sampling Laplace
 *    noise by transforming a double-precision uniform: the resulting
 *    distribution has gaps and duplicated masses that the ideal one does not,
 *    and Mironov (CCS 2012, "On Significance of the Least Significant Bits in
 *    Differential Privacy") turns exactly those artefacts into an attack that
 *    recovers the true answer. So the mechanisms this page ships by default
 *    draw only *rational* Bernoullis — comparisons between exact integers —
 *    and never look at a float.
 */

/** A source of uniform 32-bit words. */
export interface Rng {
  nextUint32(): number;
}

/** Browser/Node CSPRNG, buffered so we are not calling into it a word at a time. */
export function cryptoRng(bufferWords = 256): Rng {
  const buf = new Uint32Array(bufferWords);
  let i = buf.length;
  return {
    nextUint32(): number {
      if (i >= buf.length) {
        crypto.getRandomValues(buf);
        i = 0;
      }
      return buf[i++] >>> 0;
    },
  };
}

/**
 * sfc32, seeded — for tests only, so a statistical assertion is a fact about
 * the sampler rather than a coin flip that fails one CI run in fifty.
 * Never used by the page.
 */
export function seededRng(seed: number): Rng {
  let a = 0x9e3779b9 ^ seed;
  let b = 0x243f6a88 ^ (seed << 1);
  let c = 0xb7e15162 ^ (seed >>> 1);
  let d = 1;
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  return { nextUint32: next };
}

/**
 * A uniform integer in [0, n), without modulo bias.
 *
 * Bias here would not merely be untidy: the Bernoulli draws below are the only
 * thing standing between the mechanism and its ε, so a skewed comparison is a
 * skewed privacy loss.
 */
export function uniformBelow(rng: Rng, n: bigint): bigint {
  if (n <= 0n) throw new RangeError('uniformBelow needs n > 0');
  if (n === 1n) return 0n;
  // Smallest multiple of 32 bits that covers n, then rejection-sample the
  // largest exact multiple of n that fits.
  let bits = 0n;
  let words = 0;
  while (1n << bits < n) {
    bits += 32n;
    words += 1;
  }
  const span = 1n << bits;
  const limit = span - (span % n);
  for (;;) {
    let v = 0n;
    for (let i = 0; i < words; i++) v = (v << 32n) | BigInt(rng.nextUint32());
    if (v < limit) return v % n;
  }
}

/** Bernoulli(num/den) — exact for any rational in [0, 1]. */
export function bernoulli(rng: Rng, num: bigint, den: bigint): boolean {
  if (num <= 0n) return false;
  if (num >= den) return true;
  return uniformBelow(rng, den) < num;
}

/**
 * Bernoulli(exp(−γ)) for a rational γ = num/den ≥ 0, exactly.
 *
 * Canonne–Kamath–Steinke 2020, Algorithm 1. For γ ≤ 1 it runs A ← Bernoulli(γ/K)
 * for K = 1, 2, … until a draw fails, and returns whether the number of
 * iterations was odd; the alternating series that falls out is exactly
 * cosh γ − sinh γ = e^−γ. For γ > 1 it splits γ into ⌊γ⌋ unit pieces and a
 * remainder, using exp(−a−b) = exp(−a)·exp(−b).
 */
export function bernoulliExpNeg(rng: Rng, num: bigint, den: bigint): boolean {
  if (num < 0n || den <= 0n) throw new RangeError('bernoulliExpNeg needs γ ≥ 0');
  if (num === 0n) return true; // e^0 = 1
  if (num > den) {
    const whole = num / den;
    for (let i = 0n; i < whole; i++) {
      if (!bernoulliExpNeg(rng, 1n, 1n)) return false;
    }
    const rest = num - whole * den;
    return rest === 0n ? true : bernoulliExpNeg(rng, rest, den);
  }
  let k = 1n;
  for (;;) {
    if (!bernoulli(rng, num, den * k)) break;
    k += 1n;
  }
  return (k & 1n) === 1n;
}

/**
 * The number of consecutive Bernoulli(e^−γ) successes before the first failure:
 * Geometric with Pr[G = k] = (1 − p)·p^k for p = e^−γ.
 */
export function geometricExpNeg(rng: Rng, num: bigint, den: bigint): number {
  let k = 0;
  // A hard ceiling so a pathological γ cannot hang the page. At the smallest ε
  // this page offers the mean is ~4000, so 2^22 is ~1000× the mean and is
  // reached with probability far below 2^-1000; the throw is a tripwire, not a
  // control-flow path, and no test or UI run has ever reached it.
  const CAP = 1 << 22;
  while (bernoulliExpNeg(rng, num, den)) {
    k += 1;
    if (k > CAP) throw new Error('geometricExpNeg: implausible run length');
  }
  return k;
}
