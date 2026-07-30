/**
 * Non-negative rationals over BigInt.
 *
 * Every privacy parameter on this page is a rational, not a float, because the
 * samplers in `rng.ts` need exact integer comparisons. ε is chosen from a fixed
 * ladder of values (0.01 … 10), each of which is exactly representable here;
 * the scale, the per-step γ and the discrete Gaussian's σ² are then derived by
 * exact arithmetic rather than by rounding a double.
 */
export interface Rational {
  readonly n: bigint;
  readonly d: bigint;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

export function rat(n: bigint | number, d: bigint | number = 1n): Rational {
  let nn = BigInt(n);
  let dd = BigInt(d);
  if (dd === 0n) throw new RangeError('rational with zero denominator');
  if (dd < 0n) {
    nn = -nn;
    dd = -dd;
  }
  if (nn < 0n) throw new RangeError('this page only needs non-negative rationals');
  const g = gcd(nn, dd) || 1n;
  return { n: nn / g, d: dd / g };
}

/** Exact decimal → rational, e.g. 0.05 → 1/20. Avoids binary-float surprises. */
export function ratFromDecimal(text: string): Rational {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new RangeError(`not a decimal: ${text}`);
  const [whole, frac = ''] = trimmed.split('.');
  const d = 10n ** BigInt(frac.length);
  return rat(BigInt(whole) * d + BigInt(frac || '0'), d);
}

export const mul = (a: Rational, b: Rational): Rational => rat(a.n * b.n, a.d * b.d);
export const div = (a: Rational, b: Rational): Rational => rat(a.n * b.d, a.d * b.n);
export const add = (a: Rational, b: Rational): Rational => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const scale = (a: Rational, k: bigint | number): Rational => rat(a.n * BigInt(k), a.d);
export const divInt = (a: Rational, k: bigint | number): Rational => rat(a.n, a.d * BigInt(k));

export function toNumber(r: Rational): number {
  return Number(r.n) / Number(r.d);
}

export function cmp(a: Rational, b: Rational): number {
  const l = a.n * b.d;
  const r = b.n * a.d;
  return l < r ? -1 : l > r ? 1 : 0;
}
