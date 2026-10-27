#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', '.bin', 'vitest');
/**
 * Each mutation names the suite that owns it. The gate was single-suite when it
 * only covered the geo exhibit; the L-R-11 release-criteria work added a second
 * owning suite, so the baseline now runs EVERY owning suite before any mutation
 * is applied and again after every source is restored.
 */
const GEO = 'src/dp/geo.test.ts';
const DIVERSITY = 'src/dp/diversity.test.ts';

const mutations = [
  {
    name: 'density loses one epsilon normalisation factor',
    file: 'src/dp/geo.ts',
    from: 'epsilon * epsilon * Math.exp(-epsilon * euclidean(origin, output))',
    to: 'epsilon * Math.exp(-epsilon * euclidean(origin, output))',
    suite: GEO,
    test: 'pins the normalised density and its exponential decay',
  },
  {
    name: 'privacy-loss orientation is reversed',
    file: 'src/dp/geo.ts',
    from: 'euclidean(b, output) - euclidean(a, output)',
    to: 'euclidean(a, output) - euclidean(b, output)',
    suite: GEO,
    test: 'reaches the epsilon-times-distance bound at a collinear witness',
  },
  {
    name: 'radial CDF uses the wrong polynomial sign',
    file: 'src/dp/geo.ts',
    from: '-Math.expm1(-scaled) - scaled * Math.exp(-scaled)',
    to: '-Math.expm1(-scaled) + scaled * Math.exp(-scaled)',
    suite: GEO,
    test: 'pins the radial CDF, mean scale and quantile inversion',
  },
  {
    name: 'planar radius drops one exponential component',
    file: 'src/dp/geo.ts',
    from: '(-Math.log(uniform()) - Math.log(uniform())) / epsilon',
    to: '-Math.log(uniform()) / epsilon',
    suite: GEO,
    test: 'samples Gamma',
  },
  {
    name: 'finite-grid probabilities gain an invalid factor of two',
    file: 'src/dp/geo.ts',
    from: 'Math.exp(logProbability));',
    to: 'Math.exp(logProbability) * 2);',
    suite: GEO,
    test: 'normalises every finite distribution from its own input location',
  },
  {
    name: 'finite-grid log likelihood adds instead of subtracting',
    file: 'src/dp/geo.ts',
    from: 'logPa[i]! - logPb[i]!',
    to: 'logPa[i]! + logPb[i]!',
    suite: GEO,
    test: 'exposes the naive border normaliser violation from computed probabilities',
  },
  {
    name: 'path transcript reverses every likelihood contribution',
    file: 'src/dp/geo.ts',
    from: 'logLikelihoodAOverB += planarPrivacyLoss',
    to: 'logLikelihoodAOverB -= planarPrivacyLoss',
    suite: GEO,
    test: 'computes inference from public paths and releases without a truth input',
  },
  {
    name: 'composition bound drops epsilon',
    file: 'src/dp/geo.ts',
    from: 'sum + epsilon * euclidean(point, pathB[i]!)',
    to: 'sum + euclidean(point, pathB[i]!)',
    suite: GEO,
    test: 'sums per-release metric bounds instead of silently reusing one epsilon',
  },
  // ── L-R-11: ℓ-diversity, t-closeness, the intersection attack and the DP
  // contrast. Each edit is one line of arithmetic or one comparison, and each
  // names the single test that must go red because of it.
  {
    name: 'distinct ℓ counts records instead of distinct sensitive values',
    file: 'src/dp/diversity.ts',
    from: 'return counts.filter((c) => c > 0).length;',
    to: 'return counts.reduce((acc, c) => acc + c, 0);',
    suite: DIVERSITY,
    test: 'counts distinct VALUES, not records',
  },
  {
    name: 'the global distribution is taken from the class under test',
    file: 'src/dp/diversity.ts',
    from: '  const tableCounts = countBands(db);',
    to: '  const tableCounts = countBands(report.classes[0].members);',
    suite: DIVERSITY,
    test: 'uses the WHOLE table as the reference distribution, not the class',
  },
  {
    name: 'the EMD drops its (m − 1) normalisation factor',
    file: 'src/dp/diversity.ts',
    from: '  const denominator = (m - 1n) * C * N;',
    to: '  const denominator = C * N;',
    suite: DIVERSITY,
    test: 'matches a hand calculation on the paper’s own shape',
  },
  {
    name: 'the EMD omits one cumulative term',
    file: 'src/dp/diversity.ts',
    from: '    cumTable += BigInt(tableCounts.counts[i]!);',
    to: '    cumTable += BigInt(tableCounts.counts[i]!) * 0n;',
    suite: DIVERSITY,
    test: 'is zero exactly when the two distributions agree',
  },
  {
    name: 'the EMD reverses one side of the cumulative difference',
    file: 'src/dp/diversity.ts',
    from: '    const term = N * cumClass - C * cumTable;',
    to: '    const term = N * cumClass + C * cumTable;',
    suite: DIVERSITY,
    test: 'matches a hand calculation on a two-point domain',
  },
  {
    name: 't acceptance changes from ≤ to <',
    file: 'src/dp/diversity.ts',
    from: '  return value.numerator * threshold.d <= threshold.n * value.denominator;',
    to: '  return value.numerator * threshold.d < threshold.n * value.denominator;',
    suite: DIVERSITY,
    test: 'passes below t, passes AT t, and fails above it',
  },
  {
    name: 'the t verdict is read off the release label instead of the computation',
    file: 'src/dp/diversity.ts',
    from: '    meetsT: classes.every((c) => c.withinT),',
    to: "    meetsT: level.id === 'age-twenty',",
    suite: DIVERSITY,
    test: 'is met at equality by all three passing releases, which is why t is 9/64',
  },
  {
    name: 'the compliant age partition moves its boundary from thirty to forty',
    file: 'src/dp/registry.ts',
    from: "const splitAtThirty = (age: number): string => (age < 30 ? 'under 30' : '30 and over');",
    to: "const splitAtThirty = (age: number): string => (age < 40 ? 'under 30' : '30 and over');",
    suite: DIVERSITY,
    test: 'narrows five bands to one, and the one is right',
  },
  {
    name: 'the attacker-visible projection retains raw member records',
    file: 'src/dp/diversity.ts',
    from: '        candidateBands: c.candidateBands,',
    to: '        candidateBands: c.candidateBands, members: c.members,',
    suite: DIVERSITY,
    test: 'removes identities and raw salaries before the attacker runs',
  },
  {
    name: 'the intersection attack drops one of the two releases',
    file: 'src/dp/diversity.ts',
    from: '  for (const entry of perRelease) {',
    to: '  for (const entry of perRelease.slice(0, 1)) {',
    suite: DIVERSITY,
    test: 'narrows five bands to one, and the one is right',
  },
  {
    name: 'the attacker is handed the target’s real band',
    file: 'src/dp/diversity.ts',
    from: '  let surviving = BANDS.slice();',
    to: "  let surviving = BANDS.filter((b) => b.id === bandOf(REGISTRY.find((e) => e.id === 101).salary).id);",
    suite: DIVERSITY,
    test: 'reads the published rows, and tracks them when they change',
  },
  {
    name: 'the separating-event comparison is inverted',
    file: 'src/dp/diversity.ts',
    from: '  return withTarget !== withoutTarget;',
    to: '  return withTarget === withoutTarget;',
    suite: DIVERSITY,
    test: 'distinguishes a separating event from an event that establishes nothing',
  },
  {
    name: 'the utility truth is counted from the first class instead of the rows',
    file: 'src/dp/diversity.ts',
    from: '    for (const m of cls.members) if (m.age >= query.lo && m.age <= query.hi) truth += 1;',
    to: '    if (cls === report.classes[0]) for (const m of cls.members) if (m.age >= query.lo && m.age <= query.hi) truth += 1;',
    suite: DIVERSITY,
    test: 'derives the truth from the actual rows, at every release',
  },
  {
    name: 'the query interval counts an overlapping class as certain',
    file: 'src/dp/diversity.ts',
    from: '    if (contained) certain += cls.size;\n    else if (overlaps) possible += cls.size;',
    to: '    if (contained || overlaps) certain += cls.size;',
    suite: DIVERSITY,
    test: 'turns the same query into an interval once the bands are widened',
  },
];

const touched = [...new Set(mutations.map((mutation) => join(root, mutation.file)))];
const originals = new Map(touched.map((file) => [file, readFileSync(file)]));
const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');

function run(args) {
  return spawnSync(vitest, args, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

function restoreAll() {
  for (const [file, bytes] of originals) writeFileSync(file, bytes);
}

function assertRestored() {
  for (const [file, bytes] of originals) {
    const current = readFileSync(file);
    if (digest(current) !== digest(bytes)) throw new Error(`${relative(root, file)} was not restored byte for byte`);
  }
}

let caught = 0;
try {
  const suites = [...new Set(mutations.map((mutation) => mutation.suite))];
  const baseline = run(['run', ...suites]);
  if (baseline.status !== 0) {
    process.stderr.write(baseline.stdout);
    process.stderr.write(baseline.stderr);
    throw new Error('baseline: unmutated copy FAILED; mutation results below would be meaningless');
  }
  console.log('baseline: unmutated copy PASSES');

  for (const mutation of mutations) {
    const file = join(root, mutation.file);
    const before = readFileSync(file, 'utf8');
    const occurrences = before.split(mutation.from).length - 1;
    if (occurrences !== 1) throw new Error(`${mutation.name}: expected one source anchor, found ${occurrences}`);
    writeFileSync(file, before.replace(mutation.from, mutation.to));
    const result = run(['run', mutation.suite, '-t', mutation.test]);
    writeFileSync(file, originals.get(file));
    if (result.status === 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      throw new Error(`SURVIVED: ${mutation.name}`);
    }
    caught += 1;
    console.log(`caught ${caught}/${mutations.length}: ${mutation.name}`);
  }

  assertRestored();
  const finalBaseline = run(['run', ...suites]);
  if (finalBaseline.status !== 0) throw new Error('restored source does not pass its clean baseline');
  console.log(`all ${caught} mutation(s) caught; sources restored byte for byte`);
} finally {
  restoreAll();
  assertRestored();
}
