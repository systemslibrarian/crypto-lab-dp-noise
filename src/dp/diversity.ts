/**
 * ℓ-diversity and t-closeness, computed in exact integers.
 *
 * Two release criteria, one after the other, each answering a failure of the
 * one before it — and neither of them a differential-privacy guarantee.
 *
 * SOURCES, and what is and is not taken from them.
 *
 * - Machanavajjhala, Gehrke, Kifer and Venkitasubramaniam, "ℓ-Diversity: Privacy
 *   Beyond k-Anonymity", ICDE 2006 (the conference version; the journal version
 *   is TKDD 1(1):3, 2007). §3.1 is the homogeneity attack, §3.2 the background-
 *   knowledge attack, and Principle 2 is the ℓ-diversity principle: a q*-block
 *   is ℓ-diverse if it "contains at least ℓ well-represented values for the
 *   sensitive attribute". The paper instantiates "well represented" as **entropy
 *   ℓ-diversity** (Definition 2) and **recursive (c, ℓ)-diversity** (Definition
 *   3). It does NOT name "distinct ℓ-diversity" as a definition of its own; it
 *   notes only that entropy ℓ-diversity implies "at least ℓ distinct values".
 *
 * - Li, Li and Venkatasubramanian, "t-Closeness: Privacy Beyond k-Anonymity and
 *   ℓ-Diversity", ICDE 2007. §2 is where **distinct ℓ-diversity** is named, as
 *   the first of three interpretations of "well-represented", and it is named
 *   there with its own warning: "Distinct ℓ-diversity does not prevent
 *   probabilistic inference attacks." §3 gives the **skewness** and
 *   **similarity** attacks. Definition 2 is the t-closeness principle. §5.1
 *   gives the ordered ground distance and the closed-form EMD this file
 *   implements.
 *
 * WHAT THIS FILE IMPLEMENTS, exactly:
 *
 *   distinct ℓ-diversity — every equivalence class contains at least ℓ distinct
 *   sensitive values. This is Li et al. §2 item 1, attributed there to
 *   Machanavajjhala et al. It is the WEAKEST of the three instantiations and is
 *   never called entropy or recursive diversity anywhere on this page.
 *
 *   ordered t-closeness — every class's sensitive-value distribution is within
 *   Earth Mover's distance t of the whole released table's distribution, under
 *   the ordered ground distance of Li et al. §5.1. It is one distance among
 *   several the principle admits; the paper itself applies the principle with
 *   equal and hierarchical distances too, and says plainly that EMD "is
 *   certainly not perfect".
 */
import { analyse, type AnonymityReport, type EquivalenceClass, type GeneralizationLevel } from './kanon';
import type { Employee } from './database';
import { BAND_COUNT, BANDS, bandOf, REGISTRY, type Band } from './registry';

export interface BandCounts {
  /** Counts in declared band order, length BAND_COUNT. */
  readonly counts: readonly number[];
  readonly total: number;
}

export function countBands(members: readonly Employee[]): BandCounts {
  const counts = new Array<number>(BAND_COUNT).fill(0);
  for (const m of members) counts[bandOf(m.salary).index] += 1;
  return { counts, total: members.length };
}

/** The distinct count — the number of bands that actually appear. */
export function distinctBands(counts: readonly number[]): number {
  return counts.filter((c) => c > 0).length;
}

/**
 * The Earth Mover's distance under the ordered ground distance, as an exact
 * fraction.
 *
 * Li et al. §5.1 derive, for an ordered domain of m values with
 * `ordered_dist(v_i, v_j) = |i − j|/(m − 1)` and `r_i = p_i − q_i`:
 *
 *     D[P, Q] = (1/(m − 1)) · ( |r₁| + |r₁+r₂| + … + |r₁+…+r_{m−1}| )
 *
 * Their second form sums i from 1 to m; the two agree because the last partial
 * sum Σ_{j≤m} r_j is p's total minus q's total, which is zero. This file sums
 * all m terms and a test asserts the final term is always zero, so the identity
 * is checked rather than assumed.
 *
 * Everything is kept in integers. Writing c_i for the cumulative COUNT in the
 * class, C for the class size, g_i for the cumulative count in the whole table
 * and N for the table size:
 *
 *     D = (1/(m−1)) · Σ_i | c_i/C − g_i/N |
 *       = ( Σ_i | N·c_i − C·g_i | ) / ( (m−1)·C·N )
 *
 * so the numerator is a sum of absolute integers and the denominator is a
 * product of integers. No double ever touches the verdict; `meetsThreshold`
 * compares by cross-multiplication.
 */
export interface Emd {
  readonly numerator: bigint;
  readonly denominator: bigint;
  /** The |Σ r| terms, in band order, as exact fractions over N·C. */
  readonly cumulativeAbs: readonly bigint[];
  /** For display only. Never used for a verdict. */
  readonly approx: number;
}

/** Lowest terms, for display only — never for a verdict. */
export function reduceFraction(n: bigint, d: bigint): { n: bigint; d: bigint } {
  const g = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : g(b, a % b));
  const k = g(n, d) || 1n;
  return { n: n / k, d: d / k };
}

export function orderedEmd(classCounts: BandCounts, tableCounts: BandCounts): Emd {
  if (classCounts.total <= 0) throw new Error('an equivalence class with no records has no distribution');
  if (tableCounts.total <= 0) throw new Error('an empty table has no distribution');
  if (classCounts.counts.length !== tableCounts.counts.length) {
    throw new Error('class and table distributions span different domains');
  }
  const m = BigInt(classCounts.counts.length);
  if (m < 2n) throw new Error('the ordered ground distance needs at least two values');

  const C = BigInt(classCounts.total);
  const N = BigInt(tableCounts.total);

  let cumClass = 0n;
  let cumTable = 0n;
  let sum = 0n;
  const terms: bigint[] = [];
  for (let i = 0; i < classCounts.counts.length; i += 1) {
    cumClass += BigInt(classCounts.counts[i]!);
    cumTable += BigInt(tableCounts.counts[i]!);
    const term = N * cumClass - C * cumTable;
    const abs = term < 0n ? -term : term;
    terms.push(abs);
    sum += abs;
  }
  const denominator = (m - 1n) * C * N;
  return {
    numerator: sum,
    denominator,
    cumulativeAbs: terms,
    approx: Number(sum) / Number(denominator),
  };
}

/**
 * `value ≤ threshold`, by cross-multiplication on BigInt.
 *
 * The t-closeness principle (Li et al., Definition 2) says the distance must be
 * "no more than a threshold t", so this is `≤` and a class sitting exactly on
 * the line PASSES. The declared t in this lesson is chosen so that really
 * happens on screen.
 */
export function meetsThreshold(
  value: { numerator: bigint; denominator: bigint },
  threshold: { n: bigint; d: bigint },
): boolean {
  if (value.denominator <= 0n || threshold.d <= 0n) throw new Error('a fraction needs a positive denominator');
  return value.numerator * threshold.d <= threshold.n * value.denominator;
}

export interface ClassReport {
  readonly key: string;
  readonly age: string;
  readonly zip: string;
  readonly members: readonly Employee[];
  readonly size: number;
  readonly counts: readonly number[];
  readonly distinct: number;
  readonly emd: Emd;
  readonly withinT: boolean;
  /** The bands that appear, in declared order — the attacker's candidate set. */
  readonly candidateBands: readonly Band[];
  /** True when every band present sits below the high-earner boundary. */
  readonly allBelowThreshold: boolean;
  readonly allAboveThreshold: boolean;
}

export interface ReleaseReport {
  readonly levelId: string;
  readonly classes: readonly ClassReport[];
  readonly tableCounts: BandCounts;
  readonly k: number;
  /** The table's distinct ℓ: the minimum over classes. */
  readonly distinctL: number;
  /** The maximum class distance — the smallest t this release satisfies. */
  readonly maxEmd: Emd;
  readonly meetsK: boolean;
  readonly meetsL: boolean;
  readonly meetsT: boolean;
  readonly homogeneousClasses: readonly ClassReport[];
}

/** The boundary the rest of the lab calls "high earner". */
const HIGH_BAND_INDEX = 3;

export interface Policy {
  readonly k: number;
  readonly l: number;
  readonly t: { readonly n: bigint; readonly d: bigint };
}

export function describeRelease(
  level: GeneralizationLevel,
  policy: Policy,
  db: readonly Employee[] = REGISTRY,
): ReleaseReport {
  if (db.length === 0) throw new Error('a release of an empty table has no classes');
  const report: AnonymityReport = analyse(level, db);
  const tableCounts = countBands(db);

  const classes = report.classes.map((c: EquivalenceClass): ClassReport => {
    const counts = countBands(c.members);
    const emd = orderedEmd(counts, tableCounts);
    const candidateBands = BANDS.filter((b) => counts.counts[b.index]! > 0);
    return {
      key: c.key,
      age: c.age,
      zip: c.zip,
      members: c.members,
      size: c.members.length,
      counts: counts.counts,
      distinct: distinctBands(counts.counts),
      emd,
      withinT: meetsThreshold(emd, policy.t),
      candidateBands,
      allBelowThreshold: candidateBands.every((b) => b.index < HIGH_BAND_INDEX),
      allAboveThreshold: candidateBands.every((b) => b.index >= HIGH_BAND_INDEX),
    };
  });

  const worst = classes.reduce((acc, c) =>
    c.emd.numerator * acc.emd.denominator > acc.emd.numerator * c.emd.denominator ? c : acc,
  );
  const distinctL = Math.min(...classes.map((c) => c.distinct));

  return {
    levelId: level.id,
    classes,
    tableCounts,
    k: report.k,
    distinctL,
    maxEmd: worst.emd,
    meetsK: report.k >= policy.k,
    meetsL: distinctL >= policy.l,
    meetsT: classes.every((c) => c.withinT),
    homogeneousClasses: classes.filter((c) => c.distinct === 1),
  };
}

export function classOfRecord(report: ReleaseReport, id: number): ClassReport | null {
  return report.classes.find((c) => c.members.some((m) => m.id === id)) ?? null;
}

/**
 * The utility cost of a release, measured on a declared query rather than
 * scored.
 *
 * The query is a count over an age range. A generalised release does not answer
 * it; it bounds it. A record is counted for certain when its PUBLISHED age range
 * lies entirely inside the query range, and is merely possible when the two
 * ranges overlap without containment. The answer is the interval [certain,
 * certain + possible], and the number reported is its width.
 *
 * Width zero means the release still answers the question exactly. There is no
 * composite "utility score" here: one declared query, one interval, derived from
 * the rows of the release being measured.
 */
export interface AgeQuery {
  readonly id: string;
  readonly label: string;
  readonly lo: number;
  /** Inclusive. */
  readonly hi: number;
}

export const AGE_QUERIES: readonly AgeQuery[] = [
  { id: 'thirties', label: 'How many people are in their thirties?', lo: 30, hi: 39 },
  { id: 'forties', label: 'How many people are in their forties?', lo: 40, hi: 49 },
];

export interface QueryAnswer {
  readonly query: AgeQuery;
  readonly truth: number;
  readonly certain: number;
  readonly possible: number;
  readonly lo: number;
  readonly hi: number;
  readonly ambiguity: number;
}

/** Parse a published age cell: "any", "30–39" or "20–39". */
export function publishedAgeRange(cell: string): { lo: number; hi: number } {
  if (cell === 'any') return { lo: 0, hi: 200 };
  const match = /^(\d+)[–-](\d+)$/.exec(cell);
  if (!match) throw new Error(`cannot read a published age range from "${cell}"`);
  return { lo: Number(match[1]), hi: Number(match[2]) };
}

export function answerAgeQuery(report: ReleaseReport, query: AgeQuery): QueryAnswer {
  if (query.hi < query.lo) throw new Error('a query range must not run backwards');
  let certain = 0;
  let possible = 0;
  let truth = 0;
  for (const cls of report.classes) {
    const range = publishedAgeRange(cls.age);
    const contained = range.lo >= query.lo && range.hi <= query.hi;
    const overlaps = range.lo <= query.hi && range.hi >= query.lo;
    if (contained) certain += cls.size;
    else if (overlaps) possible += cls.size;
    for (const m of cls.members) if (m.age >= query.lo && m.age <= query.hi) truth += 1;
  }
  return {
    query,
    truth,
    certain,
    possible,
    lo: certain,
    hi: certain + possible,
    ambiguity: possible,
  };
}

/**
 * The repeated-release (intersection) attack.
 *
 * Ganta, Kasiviswanathan and Smith, "Composition Attacks and Auxiliary
 * Information in Data Privacy", KDD 2008 (arXiv:0803.0032), §1.1.1, name the two
 * properties this needs and both hold here by construction:
 *
 *   (i) *exact sensitive value disclosure* — "the sensitive value corresponding
 *       to each member of the group is published exactly", which is what
 *       microdata publishing means;
 *   (ii) *locatability* — "given any individual's non-sensitive values ... one
 *       can locate the group in which individual has been put in".
 *
 * The attacker here gets only what a reader of the two published releases gets,
 * plus the stated background knowledge. The target's real band is never passed
 * in: `intersectReleases` takes two reports and a set of attacker observations,
 * and the teaching layer compares its answer with the truth afterwards.
 */
export interface AttackerKnowledge {
  /** What the attacker knows, in the attacker's own words. */
  readonly description: string;
  /** The published quasi-identifier cell the target falls in, per release. */
  readonly locate: (report: ReleaseReport) => ClassReport | null;
}

export interface IntersectionResult {
  readonly perRelease: readonly {
    readonly levelId: string;
    readonly classKey: string;
    readonly candidates: readonly Band[];
  }[];
  readonly intersection: readonly Band[];
  readonly narrowedFrom: number;
  /** True when every surviving band is above the lab's high-earner boundary. */
  readonly disclosesHighEarner: boolean;
  readonly disclosesExactBand: boolean;
}

export function intersectReleases(
  reports: readonly ReleaseReport[],
  knowledge: AttackerKnowledge,
): IntersectionResult {
  if (reports.length < 2) throw new Error('an intersection attack needs at least two releases');
  const perRelease: IntersectionResult['perRelease'] = reports.map((report) => {
    const cls = knowledge.locate(report);
    if (!cls) throw new Error(`the attacker could not locate a class in release ${report.levelId}`);
    return { levelId: report.levelId, classKey: cls.key, candidates: cls.candidateBands };
  });

  let surviving = BANDS.slice();
  for (const entry of perRelease) {
    const allowed = new Set(entry.candidates.map((b) => b.id));
    surviving = surviving.filter((b) => allowed.has(b.id));
  }

  return {
    perRelease,
    intersection: surviving,
    narrowedFrom: BAND_COUNT,
    disclosesHighEarner: surviving.length > 0 && surviving.every((b) => b.index >= HIGH_BAND_INDEX),
    disclosesExactBand: surviving.length === 1,
  };
}

/**
 * The differential-privacy contrast, as an exact counterexample.
 *
 * The releases above are DETERMINISTIC functions of the table. Differential
 * privacy is a statement about a randomised mechanism M: for every pair of
 * neighbouring databases and every output event S,
 *
 *     Pr[M(D) ∈ S] ≤ e^ε · Pr[M(D′) ∈ S].
 *
 * Take S to be the single output event "the serialised release equals the exact
 * string this release produced on D". For a deterministic mechanism the left
 * side is 1. On the neighbouring database D′ = D minus one record the
 * serialisation differs, so the right side is e^ε · 0 = 0, and no finite ε
 * satisfies 1 ≤ 0.
 *
 * The scope of that conclusion is narrow and is stated everywhere it appears:
 * it is about THIS deterministic release and THIS event. It is not a claim that
 * a k/ℓ/t transformation could never be a step inside some differentially
 * private mechanism, and it says nothing about what ℓ-diversity or t-closeness
 * achieve on their own terms.
 */
export interface NeighbourContrast {
  readonly serialisedWith: string;
  readonly serialisedWithout: string;
  readonly outputsDiffer: boolean;
  readonly probabilityWith: 1;
  readonly probabilityWithout: 0;
  readonly finiteEpsilonExists: boolean;
  readonly event: string;
}

/** The exact published bytes of a release: classes, sizes and band multisets. */
export function serialiseRelease(report: ReleaseReport): string {
  return report.classes
    .map((c) => {
      const bands = c.members
        .map((m) => bandOf(m.salary).id)
        .sort()
        .join(',');
      return `${c.zip}|${c.age}|${c.size}|${bands}`;
    })
    .sort()
    .join('\n');
}

/**
 * Does this output event separate the two neighbouring worlds?
 *
 * Exported and tested in both directions on purpose. The conclusion "no finite
 * ε bounds this" rests entirely on this comparison, so it is a function with
 * two branches rather than a constant written beside a derivation.
 */
export function separatesWorlds(withTarget: string, withoutTarget: string): boolean {
  return withTarget !== withoutTarget;
}

export function neighbourContrast(
  level: GeneralizationLevel,
  policy: Policy,
  db: readonly Employee[],
  removeId: number,
): NeighbourContrast {
  if (!db.some((e) => e.id === removeId)) throw new Error(`record ${removeId} is not in this table`);
  const withTarget = serialiseRelease(describeRelease(level, policy, db));
  const neighbour = db.filter((e) => e.id !== removeId);
  const withoutTarget = serialiseRelease(describeRelease(level, policy, neighbour));
  const outputsDiffer = separatesWorlds(withTarget, withoutTarget);
  return {
    serialisedWith: withTarget,
    serialisedWithout: withoutTarget,
    outputsDiffer,
    probabilityWith: 1,
    probabilityWithout: 0,
    // 1 ≤ e^ε · 0 has no solution for finite ε. If the two serialisations had
    // come out identical the event would not separate the worlds and this
    // argument would not apply — so the flag is derived from the comparison.
    finiteEpsilonExists: !outputsDiffer,
    event: 'the serialised release equals the exact string produced on the database that contains the record',
  };
}
