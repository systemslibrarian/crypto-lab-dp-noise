import { describe, expect, it } from 'vitest';
import { analyticDelta } from './gaussian';
import { optimalGuessRate, ratioCurve, type CurveSpec } from './guarantee';
import { EPS_LADDER } from './params';

const laplaceAt = (eps: number, shift = 1): CurveSpec => ({
  kind: 'laplace',
  param: eps / shift,
  centre: 0,
  shift,
  eps,
  lo: -Math.ceil(30 / (eps / shift)) - 5,
  hi: Math.ceil(30 / (eps / shift)) + 5,
});

/**
 * The headline claim of the whole page, asserted rather than drawn: for the
 * discrete Laplace mechanism, the largest likelihood ratio between neighbouring
 * databases is exactly e^ε — and it is *attained*, so the ceiling is tight and
 * not merely respected.
 */
describe('the ε bound, at every stop on the ladder', () => {
  it.each(EPS_LADDER)('holds with equality at ε = %s', (text) => {
    const eps = Number(text);
    const curve = ratioCurve(laplaceAt(eps));
    expect(curve.holds).toBe(true);
    expect(curve.maxRatio).toBeCloseTo(Math.exp(eps), 6);
    // A pure ε mechanism needs no δ at all.
    expect(curve.deltaNeeded).toBeLessThan(1e-12);
  });

  /**
   * The same claim, but over the range Exhibit 2 actually examines rather than
   * the comfortable one above.
   *
   * `laplaceAt` spans ±(30/γ + 5), which at ε = 10 is nine lattice steps — far
   * inside the point where a double-precision PMF underflows. The page spans
   * ±(12·half + 40), which at ε = 10 is 136 steps, and out there both PMFs are
   * exactly 0. A `maxRatio` taken as the quotient a/b then returned Infinity
   * and `holds` returned false for a mechanism that satisfies ε exactly, so the
   * assertion above passed while the page it describes disagreed with it.
   */
  it.each(EPS_LADDER)('still holds at ε = %s over the range the page examines', (text) => {
    const eps = Number(text);
    const half = Math.min(90, Math.max(8, Math.ceil(5 / eps)));
    const span = half * 12 + 40;
    const curve = ratioCurve({ kind: 'laplace', param: eps, centre: 6, shift: 1, eps, lo: 6 - span, hi: 6 + span });
    expect(Number.isFinite(curve.maxRatio)).toBe(true);
    expect(curve.maxRatio).toBeCloseTo(Math.exp(eps), 6);
    expect(curve.holds).toBe(true);
    for (const p of curve.points) expect(Number.isFinite(p.ratio)).toBe(true);
  });

  it('holds for a sensitivity larger than one lattice step', () => {
    for (const shift of [1, 5, 51]) {
      const curve = ratioCurve(laplaceAt(1, shift));
      expect(curve.holds).toBe(true);
      expect(curve.maxRatio).toBeCloseTo(Math.E, 6);
    }
  });

  it('is symmetric in the two databases', () => {
    const curve = ratioCurve(laplaceAt(0.5));
    for (const p of curve.points) {
      expect(p.ratio).toBeGreaterThanOrEqual(1 - 1e-12);
    }
  });
});

describe('the Gaussian, and why δ exists', () => {
  it('breaks any pure ε ceiling somewhere in its tail', () => {
    const spec: CurveSpec = { kind: 'gaussian', param: 6, centre: 0, shift: 1, eps: 1, lo: -80, hi: 80 };
    const curve = ratioCurve(spec);
    expect(curve.holds).toBe(false);
    expect(curve.maxRatio).toBeGreaterThan(Math.exp(1));
    // The excess is small — which is exactly what δ is a budget for.
    expect(curve.deltaNeeded).toBeGreaterThan(0);
    expect(curve.deltaNeeded).toBeLessThan(0.05);
  });

  it('needs the δ the analytic Gaussian mechanism predicts', () => {
    // Cross-check between two independently derived quantities: the δ summed
    // pointwise off the *discrete* Gaussian's PMF, and the closed-form δ of the
    // *continuous* Gaussian at the same σ (Balle & Wang). They should agree
    // closely, and the discrete one should not need more.
    for (const [sigma, eps] of [
      [6, 0.5],
      [6, 1],
      [12, 0.5],
      [20, 0.25],
    ] as const) {
      const span = Math.ceil(12 * sigma) + 20;
      const curve = ratioCurve({ kind: 'gaussian', param: sigma, centre: 0, shift: 1, eps, lo: -span, hi: span });
      const closed = analyticDelta(1, eps, sigma);
      expect(curve.deltaNeeded / closed).toBeGreaterThan(0.9);
      expect(curve.deltaNeeded / closed).toBeLessThan(1.1);
    }
  });

  it('breaks it further out as ε rises, but never stops breaking it', () => {
    for (const eps of [1, 3, 8]) {
      const curve = ratioCurve({ kind: 'gaussian', param: 6, centre: 0, shift: 1, eps, lo: -300, hi: 300 });
      expect(curve.holds).toBe(false);
    }
  });
});

describe('optimalGuessRate — what ε means to an attacker', () => {
  it('is a coin flip as ε goes to zero and a certainty as it grows', () => {
    expect(optimalGuessRate(laplaceAt(0.01))).toBeGreaterThan(0.5);
    expect(optimalGuessRate(laplaceAt(0.01))).toBeLessThan(0.505);
    expect(optimalGuessRate(laplaceAt(10))).toBeGreaterThan(0.99);
  });

  it('rises monotonically with ε', () => {
    const rates = EPS_LADDER.map((t) => optimalGuessRate(laplaceAt(Number(t))));
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeGreaterThan(rates[i - 1]);
  });

  it('exactly attains the bound the definition allows', () => {
    // Not merely under the bound — *equal* to it. The total variation distance
    // between two discrete Laplace distributions one step apart is tanh(ε/2),
    // and (1 + tanh(ε/2))/2 is exactly e^ε/(1+e^ε). So the discrete Laplace
    // mechanism at Δ = 1 is tight for hypothesis testing as well as for the
    // likelihood ratio: an optimal attacker achieves the whole bound and not a
    // fraction of a percent more. It is why the two figures the page prints
    // side by side in Exhibit 2 are the same number, which looks like a bug and
    // is a theorem.
    for (const text of EPS_LADDER) {
      const eps = Number(text);
      expect(optimalGuessRate(laplaceAt(eps))).toBeCloseTo(Math.exp(eps) / (1 + Math.exp(eps)), 9);
    }
  });

  it('is a coin flip plus tanh(ε/2), by another route', () => {
    for (const eps of [0.05, 0.5, 2, 10]) {
      expect(optimalGuessRate(laplaceAt(eps))).toBeCloseTo((1 + Math.tanh(eps / 2)) / 2, 9);
    }
  });
});
