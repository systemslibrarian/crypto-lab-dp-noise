import { describe, expect, it } from 'vitest';
import { zcdpToDpStandard, zcdpToDpTight } from './zcdp';

describe('zCDP → (ε, δ)', () => {
  it('reproduces the standard conversion', () => {
    // ρ + 2√(ρ ln(1/δ)) at the 2020 Census budget ρ = 2.63, δ = 1e-10.
    expect(zcdpToDpStandard(2.63, 1e-10)).toBeCloseTo(18.19380261321036, 9);
  });

  it('is beaten by the Rényi-optimised conversion', () => {
    const tight = zcdpToDpTight(2.63, 1e-10);
    expect(tight.eps).toBeLessThan(zcdpToDpStandard(2.63, 1e-10));
    expect(tight.eps).toBeCloseTo(17.43, 1);
    expect(tight.alpha).toBeGreaterThan(1);
  });

  it('brackets the ε the Census Bureau published for the same ρ', () => {
    // The Bureau published ε = 17.14 for ρ = 2.63 at δ = 1e-10, using a tighter
    // numerical accountant still. The point of this assertion is not that our
    // number matches theirs — it does not — but that a single mechanism has
    // several defensible ε labels, all correct, differing by a full unit.
    const published = 17.14;
    const tight = zcdpToDpTight(2.63, 1e-10).eps;
    expect(tight).toBeGreaterThan(published);
    expect(tight).toBeLessThan(published + 1);
  });

  it('is monotone in ρ and in δ', () => {
    expect(zcdpToDpTight(5, 1e-10).eps).toBeGreaterThan(zcdpToDpTight(2.63, 1e-10).eps);
    expect(zcdpToDpTight(2.63, 1e-12).eps).toBeGreaterThan(zcdpToDpTight(2.63, 1e-6).eps);
  });
});
