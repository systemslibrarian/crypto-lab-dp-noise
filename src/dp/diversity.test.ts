import { describe, expect, it } from 'vitest';
import { EMPLOYEES, without } from './database';
import { LEVELS, analyse } from './kanon';
import {
  BANDS,
  BAND_COUNT,
  DECLARED_K,
  DECLARED_L,
  DECLARED_T,
  REGISTRY,
  REGISTRY_TARGET_ID,
  RELEASES,
  bandOf,
  releaseById,
} from './registry';
import {
  AGE_QUERIES,
  answerAgeQuery,
  classOfRecord,
  countBands,
  describeRelease,
  distinctBands,
  intersectReleases,
  meetsThreshold,
  neighbourContrast,
  orderedEmd,
  publishRelease,
  separatesWorlds,
  publishedAgeRange,
  reduceFraction,
  serialiseRelease,
} from './diversity';

const policy = { k: DECLARED_K, l: DECLARED_L, t: DECLARED_T };
const report = (id: string) => describeRelease(releaseById(id), policy);
const target = () => REGISTRY.find((e) => e.id === REGISTRY_TARGET_ID)!;

/** A fraction as an exact reduced pair, so expectations are literal integers. */
const frac = (f: { numerator: bigint; denominator: bigint }) =>
  reduceFraction(f.numerator, f.denominator);

describe('the registry table itself', () => {
  it('is sixteen rows, one per ZIP-prefix and age-decade cell', () => {
    expect(REGISTRY).toHaveLength(16);
    const cells = new Set(REGISTRY.map((e) => `${e.zip.slice(0, 3)}|${Math.floor(e.age / 10)}`));
    expect(cells.size).toBe(16);
  });

  it('leaves the payroll table and every result computed from it untouched', () => {
    // The guard that matters most in this file: this lesson added a table, it
    // did not edit the one the rest of the page is about.
    expect(EMPLOYEES).toHaveLength(12);
    expect(analyse(LEVELS.find((l) => l.id === 'k3')!).k).toBe(3);
    expect(analyse(LEVELS.find((l) => l.id === 'k6')!).k).toBe(6);
    expect(analyse(LEVELS.find((l) => l.id === 'k3')!).recordsLeaked).toBe(12);
  });

  it('has the global band distribution the lesson quotes', () => {
    const counts = countBands(REGISTRY);
    expect(counts.counts).toEqual([4, 3, 3, 4, 2]);
    expect(counts.total).toBe(16);
    expect(counts.counts.reduce((a, b) => a + b, 0)).toBe(16);
  });

  it('puts every salary in exactly one declared band, and refuses what it cannot place', () => {
    for (const e of REGISTRY) {
      const matches = BANDS.filter((b) => e.salary >= b.lo && e.salary < b.hi);
      expect(matches, `salary ${e.salary}`).toHaveLength(1);
    }
    expect(() => bandOf(-1)).toThrow(/no declared band/);
  });

  it('places the high-earner boundary exactly on the b3/b4 edge', () => {
    // The ordered domain has to agree with the threshold the rest of the lab
    // uses, or "all below $100,000" would not follow from a set of bands.
    expect(BANDS[2]!.hi).toBe(100_001);
    expect(BANDS[3]!.lo).toBe(100_001);
    expect(bandOf(100_000).id).toBe('b3');
    expect(bandOf(100_001).id).toBe('b4');
  });
});

describe('every row belongs to exactly one equivalence class', () => {
  it('partitions the registry at every release', () => {
    for (const release of RELEASES) {
      const r = describeRelease(release, policy);
      const ids = r.classes.flatMap((c) => c.members.map((m) => m.id));
      expect(ids, release.id).toHaveLength(REGISTRY.length);
      expect(new Set(ids).size, release.id).toBe(REGISTRY.length);
      expect(r.classes.reduce((a, c) => a + c.size, 0)).toBe(REGISTRY.length);
    }
  });
});

describe('exact k and distinct ℓ', () => {
  it.each([
    ['pairs', 2, 1],
    ['age-decade', 4, 3],
    ['zip3', 4, 3],
    ['age-split-30', 4, 3],
    ['age-twenty', 8, 4],
  ])('%s is %s-anonymous and distinct %s-diverse', (id, k, l) => {
    const r = report(id);
    expect(r.k).toBe(k);
    expect(r.distinctL).toBe(l);
  });

  it('counts distinct VALUES, not records', () => {
    // The mutation this pins: a class of four records holding two bands is
    // distinct 2-diverse, not distinct 4-diverse.
    expect(distinctBands([2, 0, 0, 1, 1])).toBe(3);
    expect(distinctBands([4, 0, 0, 0, 0])).toBe(1);
    expect(distinctBands([1, 1, 1, 1, 1])).toBe(5);
  });

  it('finds the one unanimous class, and names the band it gives away', () => {
    const r = report('pairs');
    expect(r.homogeneousClasses).toHaveLength(1);
    const cls = r.homogeneousClasses[0]!;
    expect(cls.zip).toBe('984**');
    expect(cls.age).toBe('20–39');
    expect(cls.size).toBe(2);
    expect(cls.candidateBands.map((b) => b.id)).toEqual(['b1']);
    expect(cls.noneAboveThreshold).toBe(true);
    // 2-anonymous and disclosing: the homogeneity attack, on actual rows.
    expect(r.k).toBeGreaterThanOrEqual(2);
    expect(r.meetsL).toBe(false);
  });

  it('has no unanimous class once the release is distinct 3-diverse', () => {
    for (const id of ['age-decade', 'zip3', 'age-split-30', 'age-twenty']) {
      expect(report(id).homogeneousClasses, id).toEqual([]);
    }
  });
});

describe('class and global distributions', () => {
  it('computes the exact counts the README prints', () => {
    const r = report('age-decade');
    const by = (age: string) => r.classes.find((c) => c.age === age)!;
    expect(by('20–29').counts).toEqual([2, 0, 0, 1, 1]);
    expect(by('30–39').counts).toEqual([2, 1, 1, 0, 0]);
    expect(by('40–49').counts).toEqual([0, 1, 1, 1, 1]);
    expect(by('50–59').counts).toEqual([0, 1, 1, 2, 0]);
  });

  it('uses the WHOLE table as the reference distribution, not the class', () => {
    // If the global distribution were taken from the class under test, every
    // EMD would be zero. One assertion that the reference really is the table.
    const r = report('age-decade');
    expect(r.tableCounts.counts).toEqual([4, 3, 3, 4, 2]);
    expect(r.tableCounts.total).toBe(16);
    expect(r.classes.every((c) => c.emd.numerator >= 0n)).toBe(true);
    expect(r.classes.some((c) => c.emd.numerator > 0n)).toBe(true);
  });
});

describe('the ordered Earth Mover’s distance', () => {
  const uniform = { counts: [1, 1, 1, 1, 1], total: 5 };

  it('is zero exactly when the two distributions agree', () => {
    const d = orderedEmd(uniform, uniform);
    expect(d.numerator).toBe(0n);
    expect(d.approx).toBe(0);
  });

  it('is symmetric', () => {
    const p = { counts: [2, 0, 0, 1, 1], total: 4 };
    const q = { counts: [4, 3, 3, 4, 2], total: 16 };
    const forward = orderedEmd(p, q);
    const backward = orderedEmd(q, p);
    expect(forward.numerator * backward.denominator).toBe(backward.numerator * forward.denominator);
  });

  it('matches a hand calculation on a two-point domain', () => {
    // m = 2, so the ground distance between the two values is |1−0|/(2−1) = 1
    // and EMD collapses to |p₁ − q₁|. P = (1, 0), Q = (1/2, 1/2) → 1/2.
    const d = orderedEmd({ counts: [1, 0], total: 1 }, { counts: [1, 1], total: 2 });
    expect(frac(d)).toEqual({ n: 1n, d: 2n });
  });

  it('matches a hand calculation on the paper’s own shape', () => {
    // Li et al. §5.1: D = (1/(m−1))·Σ|Σ_{j≤i} (p_j − q_j)|.
    // P = (1/3, 1/3, 1/3), Q = (1, 0, 0), m = 3.
    // r = (−2/3, 1/3, 1/3); partial sums −2/3, −1/3, 0; Σ|·| = 1; D = 1/2.
    const d = orderedEmd({ counts: [1, 1, 1], total: 3 }, { counts: [1, 0, 0], total: 1 });
    expect(frac(d)).toEqual({ n: 1n, d: 2n });
  });

  it('separates two classes that the variational distance cannot', () => {
    // The whole reason the paper uses EMD: P₁ sits at the bottom of the order
    // and P₂ at the top, and both are the same L1 distance from Q.
    const q = { counts: [1, 1, 1, 1, 1], total: 5 };
    const low = orderedEmd({ counts: [1, 1, 0, 0, 0], total: 2 }, q);
    const high = orderedEmd({ counts: [0, 0, 0, 1, 1], total: 2 }, q);
    expect(frac(low)).toEqual(frac(high));
    const middle = orderedEmd({ counts: [0, 0, 2, 0, 0], total: 2 }, q);
    // A class concentrated in the MIDDLE is closer under the ordered distance
    // than one concentrated at either end, which an L1 distance would not say.
    expect(middle.numerator * low.denominator).toBeLessThan(low.numerator * middle.denominator);
  });

  it('has a final cumulative term of exactly zero, which is why the paper stops at m−1', () => {
    for (const release of RELEASES) {
      for (const c of describeRelease(release, policy).classes) {
        expect(c.emd.cumulativeAbs).toHaveLength(BAND_COUNT);
        expect(c.emd.cumulativeAbs[BAND_COUNT - 1], `${release.id} ${c.key}`).toBe(0n);
      }
    }
  });

  it('normalises by (m−1)·C·N, so class size and table size both divide out', () => {
    // Doubling every count in both distributions must not move the distance.
    const p = { counts: [2, 0, 0, 1, 1], total: 4 };
    const q = { counts: [4, 3, 3, 4, 2], total: 16 };
    const once = orderedEmd(p, q);
    const twice = orderedEmd(
      { counts: p.counts.map((c) => c * 2), total: 8 },
      { counts: q.counts.map((c) => c * 2), total: 32 },
    );
    expect(once.numerator * twice.denominator).toBe(twice.numerator * once.denominator);
  });

  it('refuses an empty class, an empty table and a mismatched domain', () => {
    expect(() => orderedEmd({ counts: [0, 0], total: 0 }, uniform)).toThrow(/no records/);
    expect(() => orderedEmd(uniform, { counts: [0, 0, 0, 0, 0], total: 0 })).toThrow(/empty table/);
    expect(() => orderedEmd({ counts: [1, 1], total: 2 }, uniform)).toThrow(/different domains/);
    expect(() => orderedEmd({ counts: [1], total: 1 }, { counts: [1], total: 1 })).toThrow(
      /at least two values/,
    );
  });

  it('refuses counts that are negative, fractional or inconsistent with their total', () => {
    expect(() => orderedEmd({ counts: [2, -1], total: 1 }, { counts: [1, 1], total: 2 })).toThrow(
      /non-negative/,
    );
    expect(() => orderedEmd({ counts: [0.5, 0.5], total: 1 }, { counts: [1, 1], total: 2 })).toThrow(
      /safe integers/,
    );
    expect(() => orderedEmd({ counts: [1, 1], total: 3 }, { counts: [1, 1], total: 2 })).toThrow(
      /sum to its declared total/,
    );
  });
});

describe('the declared t, applied by cross-multiplication', () => {
  it('passes below t, passes AT t, and fails above it', () => {
    const t = { n: 9n, d: 64n };
    expect(meetsThreshold({ numerator: 8n, denominator: 64n }, t)).toBe(true);
    expect(meetsThreshold({ numerator: 9n, denominator: 64n }, t)).toBe(true);
    expect(meetsThreshold({ numerator: 10n, denominator: 64n }, t)).toBe(false);
    // The same three, written over a different denominator, must agree.
    expect(meetsThreshold({ numerator: 32n, denominator: 256n }, t)).toBe(true);
    expect(meetsThreshold({ numerator: 36n, denominator: 256n }, t)).toBe(true);
    expect(meetsThreshold({ numerator: 40n, denominator: 256n }, t)).toBe(false);
  });

  it('refuses a malformed threshold or a malformed value', () => {
    expect(() => meetsThreshold({ numerator: 1n, denominator: 0n }, { n: 1n, d: 2n })).toThrow(
      /positive denominator/,
    );
    expect(() => meetsThreshold({ numerator: 1n, denominator: 2n }, { n: 1n, d: 0n })).toThrow(
      /positive denominator/,
    );
    expect(() => meetsThreshold({ numerator: -1n, denominator: 2n }, { n: 1n, d: 2n })).toThrow(
      /non-negative/,
    );
    expect(() => meetsThreshold({ numerator: 1n, denominator: 2n }, { n: -1n, d: 2n })).toThrow(
      /non-negative/,
    );
  });

  it('is met at equality by all three passing releases, which is why t is 9/64', () => {
    for (const id of ['zip3', 'age-split-30', 'age-twenty']) {
      const r = report(id);
      expect(frac(r.maxEmd), id).toEqual({ n: 9n, d: 64n });
      expect(r.meetsT, id).toBe(true);
    }
  });

  it.each([
    ['pairs', 29n, 64n],
    ['age-decade', 17n, 64n],
    ['zip3', 9n, 64n],
    ['age-split-30', 9n, 64n],
    ['age-twenty', 9n, 64n],
  ])('pins the learner-visible maximum distance for %s', (id, n, d) => {
    expect(frac(report(id).maxEmd)).toEqual({ n, d });
  });
});

describe('distinct ℓ-diversity passes where t-closeness does not', () => {
  it('finds a distinct 3-diverse class whose values are all below the threshold', () => {
    // Li et al. §3, the similarity attack: the values are distinct and
    // semantically adjacent, so the class still discloses.
    const r = report('age-decade');
    expect(r.meetsL).toBe(true);
    const similar = r.classes.find((c) => c.age === '30–39')!;
    expect(similar.distinct).toBe(3);
    expect(similar.candidateBands.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
    expect(similar.noneAboveThreshold).toBe(true);
    // ... and it is exactly this class that t-closeness rejects.
    expect(similar.withinT).toBe(false);
    expect(frac(similar.emd)).toEqual({ n: 17n, d: 64n });
    expect(r.meetsT).toBe(false);
  });

  it('is repaired by a release that meets k, ℓ and t together', () => {
    const r = report('age-twenty');
    expect(r.meetsK).toBe(true);
    expect(r.meetsL).toBe(true);
    expect(r.meetsT).toBe(true);
    expect(r.classes.every((c) => c.withinT)).toBe(true);
    expect(r.classes.every((c) => !c.noneAboveThreshold && !c.allAboveThreshold)).toBe(true);
  });

  it('does not claim the reverse implication', () => {
    // A release can satisfy t and still be only distinct 3-diverse: the two
    // criteria are different measurements, not a ladder.
    const zip = report('zip3');
    expect(zip.meetsT).toBe(true);
    expect(zip.distinctL).toBe(3);
    expect(zip.distinctL).toBeLessThan(report('age-twenty').distinctL);
  });
});

describe('the utility cost, read off the rows', () => {
  it('answers the declared query exactly when the age band matches it', () => {
    const r = report('age-decade');
    const a = answerAgeQuery(r, AGE_QUERIES[0]!);
    expect(a.truth).toBe(4);
    expect(a.lo).toBe(4);
    expect(a.hi).toBe(4);
    expect(a.ambiguity).toBe(0);
  });

  it('turns the same query into an interval once the bands are widened', () => {
    const r = report('age-twenty');
    const a = answerAgeQuery(r, AGE_QUERIES[0]!);
    expect(a.truth).toBe(4);
    expect(a.lo).toBe(0);
    expect(a.hi).toBe(8);
    expect(a.ambiguity).toBe(8);
    // The truth is inside the interval the release admits, which is the only
    // honesty requirement on a bound.
    expect(a.truth).toBeGreaterThanOrEqual(a.lo);
    expect(a.truth).toBeLessThanOrEqual(a.hi);
  });

  it('loses the query entirely when age is suppressed', () => {
    const a = answerAgeQuery(report('zip3'), AGE_QUERIES[0]!);
    expect(a.lo).toBe(0);
    expect(a.hi).toBe(16);
    expect(a.ambiguity).toBe(16);
  });

  it('derives the truth from the actual rows, at every release', () => {
    // The same sixteen people are in every release, so the true answer cannot
    // depend on which one is published. A utility figure computed off a stale
    // table would break this.
    for (const release of RELEASES) {
      for (const q of AGE_QUERIES) {
        const a = answerAgeQuery(describeRelease(release, policy), q);
        const direct = REGISTRY.filter((e) => e.age >= q.lo && e.age <= q.hi).length;
        expect(a.truth, `${release.id}/${q.id}`).toBe(direct);
        expect(a.truth).toBeGreaterThanOrEqual(a.lo);
        expect(a.truth).toBeLessThanOrEqual(a.hi);
      }
    }
  });

  it('refuses a malformed published range or a backwards query', () => {
    expect(() => publishedAgeRange('grown-up')).toThrow(/cannot read a published age range/);
    expect(publishedAgeRange('any')).toEqual({ lo: 0, hi: 200 });
    expect(publishedAgeRange('under 30')).toEqual({ lo: 0, hi: 29 });
    expect(publishedAgeRange('30 and over')).toEqual({ lo: 30, hi: 200 });
    expect(publishedAgeRange('30–39')).toEqual({ lo: 30, hi: 39 });
    expect(() => answerAgeQuery(report('zip3'), { id: 'bad', label: 'x', lo: 40, hi: 30 })).toThrow(
      /must not run backwards/,
    );
  });
});

describe('the repeated-release intersection attack', () => {
  const zip = () => report('zip3');
  const age = () => report('age-split-30');
  const knowledge = {
    description: 'the target’s ZIP prefix and the fact that the target is under thirty',
    observations: [
      { levelId: 'zip3', dept: 'any', age: 'any', zip: '981**' },
      { levelId: 'age-split-30', dept: 'any', age: 'under 30', zip: '98***' },
    ],
  };

  it('publishes two releases that each satisfy the stated k, ℓ and t on their own', () => {
    for (const r of [zip(), age()]) {
      expect(r.meetsK).toBe(true);
      expect(r.meetsL).toBe(true);
      expect(r.meetsT).toBe(true);
      expect(r.homogeneousClasses).toEqual([]);
    }
  });

  it('narrows five bands to one, and the one is right', () => {
    const result = intersectReleases([publishRelease(zip()), publishRelease(age())], knowledge);
    expect(result.perRelease.map((p) => p.candidates.map((b) => b.id))).toEqual([
      ['b2', 'b3', 'b4'],
      ['b1', 'b4', 'b5'],
    ]);
    expect(result.intersection.map((b) => b.id)).toEqual(['b4']);
    expect(result.narrowedFrom).toBe(BAND_COUNT);
    expect(result.disclosesExactBand).toBe(true);
    expect(result.disclosesHighEarner).toBe(true);
    // Checked against the truth only HERE, after the attack has finished.
    expect(bandOf(target().salary).id).toBe('b4');
  });

  it('does not reveal the exact band or high-earner predicate from either release alone', () => {
    // Each release still narrows the target, but neither settles the exact band
    // or the declared high-earner predicate until their supports are combined.
    for (const r of [zip(), age()]) {
      const cls = classOfRecord(r, REGISTRY_TARGET_ID)!;
      expect(cls.candidateBands.length).toBeGreaterThan(1);
      expect(cls.allAboveThreshold).toBe(false);
      expect(cls.noneAboveThreshold).toBe(false);
    }
  });

  it('removes identities and raw salaries before the attacker runs', () => {
    const published = publishRelease(zip());
    const bytes = JSON.stringify(published);
    expect(bytes).not.toContain('members');
    expect(bytes).not.toContain('R-101');
    expect(bytes).not.toContain('118000');
    expect(published.classes.every((cls) => cls.candidateBands.length > 0)).toBe(true);
  });

  it('reads the published rows, and tracks them when they change', () => {
    // If a retained truth fed the attack, changing the OTHER rows would not
    // move the answer. It does.
    const scrubbed = REGISTRY.map((e) =>
      e.id === REGISTRY_TARGET_ID ? e : { ...e, salary: 44_000 },
    );
    const result = intersectReleases(
      [
        publishRelease(describeRelease(releaseById('zip3'), policy, scrubbed)),
        publishRelease(describeRelease(releaseById('age-split-30'), policy, scrubbed)),
      ],
      knowledge,
    );
    expect(result.perRelease[0]!.candidates.map((b) => b.id)).toEqual(['b1', 'b4']);
    expect(result.intersection.map((b) => b.id)).toEqual(['b1', 'b4']);
    // And it no longer discloses the exact band, because the published rows no
    // longer support that conclusion.
    expect(result.disclosesExactBand).toBe(false);
  });

  it('follows the target\u2019s own band when that band changes', () => {
    // Moving the target from b4 to b2 must move the attack's answer to b2.
    // Nothing in `intersectReleases` is told which band is the right one.
    const moved = REGISTRY.map((e) =>
      e.id === REGISTRY_TARGET_ID ? { ...e, salary: 66_000 } : e,
    );
    const result = intersectReleases(
      [
        publishRelease(describeRelease(releaseById('zip3'), policy, moved)),
        publishRelease(describeRelease(releaseById('age-split-30'), policy, moved)),
      ],
      knowledge,
    );
    expect(result.intersection.map((b) => b.id)).toEqual(['b2']);
    expect(bandOf(moved.find((e) => e.id === REGISTRY_TARGET_ID)!.salary).id).toBe('b2');
    expect(result.disclosesHighEarner).toBe(false);
  });

  it('refuses to run on fewer than two releases', () => {
    expect(() => intersectReleases([publishRelease(zip())], knowledge)).toThrow(/at least two releases/);
  });

  it('refuses when the attacker cannot locate the target', () => {
    expect(() =>
      intersectReleases([publishRelease(zip()), publishRelease(age())], {
        description: 'nothing',
        observations: [
          { levelId: 'zip3', dept: 'any', age: 'any', zip: '999**' },
          { levelId: 'age-split-30', dept: 'any', age: 'under 30', zip: '98***' },
        ],
      }),
    ).toThrow(/could not .*locate/);
  });

  it('refuses missing or ambiguous background observations', () => {
    expect(() =>
      intersectReleases([publishRelease(zip()), publishRelease(age())], {
        description: 'only one observation',
        observations: [{ levelId: 'zip3', dept: 'any', age: 'any', zip: '981**' }],
      }),
    ).toThrow(/exactly one observation/);
    expect(() =>
      intersectReleases([publishRelease(zip()), publishRelease(age())], {
        description: 'two conflicting observations',
        observations: [
          { levelId: 'zip3', dept: 'any', age: 'any', zip: '981**' },
          { levelId: 'zip3', dept: 'any', age: 'any', zip: '982**' },
          { levelId: 'age-split-30', dept: 'any', age: 'under 30', zip: '98***' },
        ],
      }),
    ).toThrow(/exactly one observation/);
  });
});

describe('the differential-privacy contrast', () => {
  const level = releaseById('age-twenty');

  it('computes the two neighbouring releases rather than asserting the conclusion', () => {
    const contrast = neighbourContrast(level, policy, REGISTRY, REGISTRY_TARGET_ID);
    expect(contrast.serialisedWith).not.toBe('');
    expect(contrast.serialisedWithout).not.toBe('');
    expect(contrast.outputsDiffer).toBe(true);
    expect(contrast.thisEventRulesOutFiniteEpsilon).toBe(true);
    // The event is the output itself: probability 1 in one world, 0 in the other.
    expect(contrast.probabilityWith).toBe(1);
    expect(contrast.probabilityWithout).toBe(0);
  });

  it('builds the neighbouring world by removing exactly one record', () => {
    const neighbour = REGISTRY.filter((e) => e.id !== REGISTRY_TARGET_ID);
    expect(neighbour).toHaveLength(REGISTRY.length - 1);
    const serialised = serialiseRelease(describeRelease(level, policy, neighbour));
    expect(neighbourContrast(level, policy, REGISTRY, REGISTRY_TARGET_ID).serialisedWithout).toBe(
      serialised,
    );
  });

  it('reuses the payroll’s own neighbouring-world helper on the payroll', () => {
    // The existing machinery, untouched: `without` is what Exhibit 2's two
    // worlds are built from, and it still is.
    expect(without(EMPLOYEES, 1)).toHaveLength(11);
    expect(without(EMPLOYEES, 1).some((e) => e.id === 1)).toBe(false);
  });

  it('distinguishes a separating event from an event that establishes nothing', () => {
    // Both branches of the comparison, driven directly. Equality means only
    // that this event is inconclusive; it does not prove finite-epsilon DP.
    expect(separatesWorlds('a', 'b')).toBe(true);
    expect(separatesWorlds('a', 'a')).toBe(false);
  });

  it('serialises deterministically, and differently for different tables', () => {
    const a = serialiseRelease(describeRelease(level, policy, REGISTRY));
    const b = serialiseRelease(describeRelease(level, policy, REGISTRY));
    expect(a).toBe(b);
    const moved = REGISTRY.map((e) =>
      e.id === REGISTRY_TARGET_ID ? { ...e, salary: 44_000 } : e,
    );
    expect(serialiseRelease(describeRelease(level, policy, moved))).not.toBe(a);
  });

  it('refuses to remove a record that is not there', () => {
    expect(() => neighbourContrast(level, policy, REGISTRY, 9_999)).toThrow(/is not in this table/);
  });
});

describe('malformed inputs fail explicitly', () => {
  it('refuses an unknown release id and an unknown band id', () => {
    expect(() => releaseById('nope')).toThrow(/no release/);
  });

  it('refuses a release of an empty table', () => {
    expect(() => describeRelease(releaseById('zip3'), policy, [])).toThrow(/empty table/);
  });
});
