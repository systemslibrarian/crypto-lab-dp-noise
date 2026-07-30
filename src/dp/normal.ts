/**
 * The normal CDF, to full double precision.
 *
 * The Gaussian mechanism's δ is a difference of two Φ values that very nearly
 * cancel, so a 1e-7 approximation of Φ — the one most JavaScript snippets use —
 * loses every significant digit of a δ near 1e-9. The Chebyshev erfc below
 * (Numerical Recipes 3rd ed., §6.2) is accurate to about 1e-15 relative, which
 * is what makes the analytic Gaussian calibration in `gaussian.ts` meaningful.
 */

const COF = [
  -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
  -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
  -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
  5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-12, -6.886027e-12,
  8.94487e-13, 3.13092e-13, -1.12708e-13, 3.81e-16, 7.106e-15, -1.523e-15, -9.4e-17, 1.21e-16,
  -2.8e-17,
];

function erfcCheb(z: number): number {
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  let d = 0;
  let dd = 0;
  for (let j = COF.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + COF[j];
    dd = tmp;
  }
  return t * Math.exp(-z * z + 0.5 * (COF[0] + ty * d) - dd);
}

export function erfc(x: number): number {
  return x >= 0 ? erfcCheb(x) : 2 - erfcCheb(-x);
}

export function erf(x: number): number {
  return 1 - erfc(x);
}

/** Φ(x): the standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

/** φ(x): the standard normal density. */
export function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}
