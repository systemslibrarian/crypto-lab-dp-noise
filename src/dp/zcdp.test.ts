import { describe, expect, it } from 'vitest';
import { zcdpToDpStandard, zcdpToDpTight } from './zcdp';

// The 2020 Census redistricting release, production settings (Abowd et al.,
// arXiv:2204.08986, §8.2): ρ = 2.63 in all, 2.56 for the persons tables and
// 0.07 for housing units, converted at δ = 1e-10 (§2.1). The Bureau published
// ε = 17.14 for the persons file and 2.47 for housing units, and quoted the
// total as their sum, 19.61 (census.gov press release, 9 June 2021).
const DELTA = 1e-10;
const RHO_PERSONS = 2.56;
const RHO_HOUSING = 0.07;
const RHO_TOTAL = RHO_PERSONS + RHO_HOUSING;
const PUBLISHED_PERSONS = 17.14;
const PUBLISHED_HOUSING = 2.47;

describe('zCDP → (ε, δ)', () => {
  it('reproduces the standard conversion', () => {
    // ρ + 2√(ρ ln(1/δ)) at the persons-file budget ρ = 2.56 and at the summed
    // budget ρ = 2.63, both at δ = 1e-10.
    expect(zcdpToDpStandard(RHO_PERSONS, DELTA)).toBeCloseTo(17.91528291900186, 9);
    expect(zcdpToDpStandard(RHO_TOTAL, DELTA)).toBeCloseTo(18.19380261321036, 9);
  });

  it('is beaten by the Rényi-optimised conversion', () => {
    const tight = zcdpToDpTight(RHO_PERSONS, DELTA);
    expect(tight.eps).toBeLessThan(zcdpToDpStandard(RHO_PERSONS, DELTA));
    expect(tight.eps).toBeCloseTo(17.158, 2);
    expect(tight.alpha).toBeGreaterThan(1);
    expect(zcdpToDpTight(RHO_TOTAL, DELTA).eps).toBeCloseTo(17.431, 2);
  });

  it('reproduces the ε the Census Bureau published for the same file', () => {
    // Like with like: the persons file's ρ against the persons file's ε. The
    // Bureau quotes ρ to two places and dε/dρ ≈ α ≈ 3.9 here, so if the
    // published 17.14 came from this bound it must sit between the conversions
    // of 2.555 and 2.565 — and it does. At the exact production setting in the
    // Bureau's published run certificate (DAS-PL94171-PRODUCTION-RUN1A, 24 June
    // 2021), ρ = 293764/114921, the same bound reproduces the certified
    // ε = 17849145/1041158 to better than 1e-7, and likewise for housing units.
    // The standard closed form is about 0.78 higher for the same mechanism — a
    // different, equally valid label.
    expect(zcdpToDpTight(RHO_PERSONS - 0.005, DELTA).eps).toBeLessThan(PUBLISHED_PERSONS);
    expect(zcdpToDpTight(RHO_PERSONS + 0.005, DELTA).eps).toBeGreaterThan(PUBLISHED_PERSONS);
    expect(zcdpToDpTight(293764 / 114921, DELTA).eps).toBeCloseTo(17849145 / 1041158, 7);
    expect(zcdpToDpTight(11417641 / 152349649, DELTA).eps).toBeCloseTo(1455307 / 588081, 6);
    expect(zcdpToDpStandard(RHO_PERSONS, DELTA) - PUBLISHED_PERSONS).toBeCloseTo(0.775, 2);
  });

  it('shows the published total as a sum of per-file ε, not a conversion of the summed ρ', () => {
    // 17.14 + 2.47 = 19.61 as published exceeds either conversion of ρ = 2.63;
    // the Bureau's paper (§8.1, footnote 21) notes that converting the summed ρ
    // is the more accurate statement of the global budget.
    const publishedTotal = PUBLISHED_PERSONS + PUBLISHED_HOUSING;
    expect(publishedTotal).toBeCloseTo(19.61, 10);
    expect(zcdpToDpStandard(RHO_TOTAL, DELTA)).toBeLessThan(publishedTotal);
    expect(zcdpToDpTight(RHO_TOTAL, DELTA).eps).toBeLessThan(publishedTotal);
    expect(publishedTotal - zcdpToDpTight(RHO_TOTAL, DELTA).eps).toBeCloseTo(2.179, 2);
  });

  it('is monotone in ρ and in δ', () => {
    expect(zcdpToDpTight(5, DELTA).eps).toBeGreaterThan(zcdpToDpTight(RHO_PERSONS, DELTA).eps);
    expect(zcdpToDpTight(RHO_PERSONS, 1e-12).eps).toBeGreaterThan(zcdpToDpTight(RHO_PERSONS, 1e-6).eps);
  });
});
