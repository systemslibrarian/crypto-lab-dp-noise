import { describe, expect, it } from 'vitest';
import { erf, erfc, normalCdf, normalPdf } from './normal';

/**
 * Reference values for Φ and erf, to twelve digits. These are the known-answer
 * tests this page has in place of spec vectors: the Gaussian mechanism's δ is a
 * difference of two nearly-equal Φ values, so an approximation good to 1e-7 —
 * which most JavaScript normal-CDF snippets are — would return noise for a δ of
 * 1e-9, and nothing downstream would notice.
 */
describe('normalCdf — known answers', () => {
  it.each([
    [0, 0.5],
    [1, 0.841344746068543],
    [-1, 0.158655253931457],
    [1.96, 0.975002104851780],
    [-1.96, 0.024997895148220],
    [2, 0.977249868051821],
    [3, 0.998650101968370],
    [-3, 0.001349898031630],
    [5, 0.999999713348428],
  ])('Φ(%s) = %s', (x, expected) => {
    expect(normalCdf(x)).toBeCloseTo(expected, 12);
  });

  it('is accurate deep in the tail, where δ lives', () => {
    // Φ(−8) ≈ 6.22096057427178e-16 — an absolute-error test would pass here for
    // any implementation that returned zero, so compare relatively.
    expect(normalCdf(-8) / 6.22096057427178e-16).toBeCloseTo(1, 6);
  });

  it('is symmetric', () => {
    for (const x of [0.3, 1.1, 2.7, 4.4]) {
      expect(normalCdf(x) + normalCdf(-x)).toBeCloseTo(1, 14);
    }
  });
});

describe('erf and erfc', () => {
  it.each([
    [0, 0],
    [0.5, 0.520499877813047],
    [1, 0.842700792949715],
    [2, 0.995322265018953],
  ])('erf(%s) = %s', (x, expected) => {
    expect(erf(x)).toBeCloseTo(expected, 12);
  });

  it('is odd, and erfc is its complement', () => {
    for (const x of [0.2, 1.3, 3.1]) {
      expect(erf(-x)).toBeCloseTo(-erf(x), 13);
      expect(erfc(x)).toBeCloseTo(1 - erf(x), 13);
    }
  });
});

describe('normalPdf', () => {
  it('peaks at 1/√(2π)', () => {
    expect(normalPdf(0)).toBeCloseTo(0.3989422804014327, 15);
    expect(normalPdf(1)).toBeCloseTo(0.24197072451914337, 15);
  });
});
