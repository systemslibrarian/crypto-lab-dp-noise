#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(root, 'node_modules', '.bin', 'vitest');
const testFile = 'src/dp/geo.test.ts';

const mutations = [
  {
    name: 'density loses one epsilon normalisation factor',
    file: 'src/dp/geo.ts',
    from: 'epsilon * epsilon * Math.exp(-epsilon * euclidean(origin, output))',
    to: 'epsilon * Math.exp(-epsilon * euclidean(origin, output))',
    test: 'pins the normalised density and its exponential decay',
  },
  {
    name: 'privacy-loss orientation is reversed',
    file: 'src/dp/geo.ts',
    from: 'euclidean(b, output) - euclidean(a, output)',
    to: 'euclidean(a, output) - euclidean(b, output)',
    test: 'reaches the epsilon-times-distance bound at a collinear witness',
  },
  {
    name: 'radial CDF uses the wrong polynomial sign',
    file: 'src/dp/geo.ts',
    from: '-Math.expm1(-scaled) - scaled * Math.exp(-scaled)',
    to: '-Math.expm1(-scaled) + scaled * Math.exp(-scaled)',
    test: 'pins the radial CDF, mean scale and quantile inversion',
  },
  {
    name: 'planar radius drops one exponential component',
    file: 'src/dp/geo.ts',
    from: '(-Math.log(uniform()) - Math.log(uniform())) / epsilon',
    to: '-Math.log(uniform()) / epsilon',
    test: 'samples Gamma',
  },
  {
    name: 'finite-grid probabilities gain an invalid factor of two',
    file: 'src/dp/geo.ts',
    from: 'Math.exp(logProbability));',
    to: 'Math.exp(logProbability) * 2);',
    test: 'normalises every finite distribution from its own input location',
  },
  {
    name: 'finite-grid log likelihood adds instead of subtracting',
    file: 'src/dp/geo.ts',
    from: 'logPa[i]! - logPb[i]!',
    to: 'logPa[i]! + logPb[i]!',
    test: 'exposes the naive border normaliser violation from computed probabilities',
  },
  {
    name: 'path transcript reverses every likelihood contribution',
    file: 'src/dp/geo.ts',
    from: 'logLikelihoodAOverB += planarPrivacyLoss',
    to: 'logLikelihoodAOverB -= planarPrivacyLoss',
    test: 'computes inference from public paths and releases without a truth input',
  },
  {
    name: 'composition bound drops epsilon',
    file: 'src/dp/geo.ts',
    from: 'sum + epsilon * euclidean(point, pathB[i]!)',
    to: 'sum + euclidean(point, pathB[i]!)',
    test: 'sums per-release metric bounds instead of silently reusing one epsilon',
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
  const baseline = run(['run', testFile]);
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
    const result = run(['run', testFile, '-t', mutation.test]);
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
  const finalBaseline = run(['run', testFile]);
  if (finalBaseline.status !== 0) throw new Error('restored source does not pass its clean baseline');
  console.log(`all ${caught} mutation(s) caught; sources restored byte for byte`);
} finally {
  restoreAll();
  assertRestored();
}
