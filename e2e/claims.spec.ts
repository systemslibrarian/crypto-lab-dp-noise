import { expect, test } from '@playwright/test';

test('the differencing comparison follows the session budget without charging or resampling it', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.selectOption('#leak-mode', 'dp');
  await page.locator('#leak-out .layered__more > summary').click();

  const comparison = page.locator('#leak-budget-quote');
  const answers = await page.locator('#leak-out .chip__value').allTextContents();
  await expect(comparison).toContainText('ε = 2 per run');
  await expect(comparison).toContainText('ε = 10 across the five runs');
  await expect(comparison).toContainText('budget 1.50, charged 0.000, remaining 1.500');
  await expect(comparison).toContainText('admit the first query and refuse the second');
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');

  await page.selectOption('#bud-budget', '3');
  await expect(comparison).toContainText('budget 3.00, charged 0.000, remaining 3.000');
  await expect(comparison).toContainText('admit both queries of one run');
  expect(await page.locator('#leak-out .chip__value').allTextContents()).toEqual(answers);
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');

  for (let i = 0; i < 3; i++) await page.click('#ask-sum');
  await expect(comparison).toContainText('budget 3.00, charged 1.500, remaining 1.500');
  await expect(comparison).toContainText('admit the first query and refuse the second');
  for (let i = 0; i < 2; i++) await page.click('#ask-sum');
  await expect(comparison).toContainText('budget 3.00, charged 2.500, remaining 0.500');
  await expect(comparison).toContainText('refuse the first query');

  await page.click('#bud-reset');
  await expect(comparison).toContainText('admit both queries of one run');
  await page.selectOption('#bud-budget', '10');
  await expect(comparison).toContainText('budget 10.00, charged 0.000, remaining 10.000');
  await expect(comparison).toContainText('admit both queries of one run');
  await expect(comparison).toContainText('all five runs would remain within this budget');
  await page.click('#leak-run');
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');
  await expect(comparison).toContainText('does not charge the session ledger');
});

test('the scope card points to current CI evidence instead of a stale test count', async ({ page }) => {
  await page.goto('.');

  const card = page.locator('.card', { has: page.getByRole('heading', { name: 'Real here' }) });
  await expect(card).toContainText('current CI run');
  await expect(card).toContainText('executes the full Vitest suite before it can build or deploy');
  await expect(card).toContainText('rather than a test count copied into this page');
  await expect(card).not.toContainText(/\b\d+ tests pass\b/i);
  await expect(card.getByRole('link', { name: 'current CI run' })).toHaveAttribute(
    'href',
    'https://github.com/systemslibrarian/crypto-lab-dp-noise/actions/workflows/deploy.yml',
  );
});

const asDataNumber = async (locator: import('@playwright/test').Locator): Promise<number> => {
  const value = await locator.getAttribute('data-value');
  expect(value).not.toBeNull();
  return Number(value);
};

function independentSfc32(seed: number): () => number {
  let a = 0x9e3779b9 ^ seed;
  let b = 0x243f6a88 ^ (seed << 1);
  let c = 0xb7e15162 ^ (seed >>> 1);
  let d = 1;
  const next = (): number => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  return next;
}

function independentUniform(nextWord: () => number): number {
  const hi = nextWord() >>> 5;
  const lo = nextWord() >>> 6;
  return (hi * 67_108_864 + lo + 0.5) / 9_007_199_254_740_992;
}

function independentPlanarDraw(
  epsilon: number,
  origin: { x: number; y: number },
  nextWord: () => number,
): { x: number; y: number; radius: number } {
  const radius =
    (-Math.log(independentUniform(nextWord)) - Math.log(independentUniform(nextWord))) / epsilon;
  const angle = 2 * Math.PI * independentUniform(nextWord);
  return {
    x: origin.x + radius * Math.cos(angle),
    y: origin.y + radius * Math.sin(angle),
    radius,
  };
}

test('geo bound and finite-grid labels follow independently recomputed probabilities', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();

  await expect(page.locator('#geo > .controls')).toHaveRole('group');
  await expect(page.locator('#geo > .controls')).toHaveAccessibleName('Geo-indistinguishability parameters');

  const epsilon = 0.5;
  const separation = 1;
  expect(await asDataNumber(page.locator('#geo-loss-stat'))).toBeCloseTo(epsilon * separation, 14);
  expect(await asDataNumber(page.locator('#geo-bound-stat'))).toBeCloseTo(epsilon * separation, 14);
  expect(await asDataNumber(page.locator('#geo-ratio-stat'))).toBeCloseTo(Math.exp(epsilon * separation), 14);

  const grid = Array.from({ length: 49 }, (_, index) => ({
    x: (index % 7) - 3,
    y: Math.floor(index / 7) - 3,
  }));
  const distribution = (rate: number, input: { x: number; y: number }): number[] => {
    const weights = grid.map((z) => Math.exp(-rate * Math.hypot(input.x - z.x, input.y - z.y)));
    const normaliser = weights.reduce((sum, weight) => sum + weight, 0);
    return weights.map((weight) => weight / normaliser);
  };
  const maxLoss = (rate: number): number => {
    const a = distribution(rate, { x: -3, y: 0 });
    const b = distribution(rate, { x: -2, y: 0 });
    return Math.max(...a.map((p, i) => Math.abs(Math.log(p) - Math.log(b[i]!))));
  };
  const naive = maxLoss(epsilon);
  const repaired = maxLoss(epsilon / 2);
  expect(await asDataNumber(page.locator('#geo-grid-naive'))).toBeCloseTo(naive, 14);
  expect(await asDataNumber(page.locator('#geo-grid-repaired'))).toBeCloseTo(repaired, 14);
  expect(naive).toBeGreaterThan(epsilon);
  expect(repaired).toBeLessThanOrEqual(epsilon);
  await expect(page.locator('#geo-grid-naive')).toContainText('violates bound');
  await expect(page.locator('#geo-grid-repaired')).toContainText('within bound');
});

test('geo sampled utility is the current seeded run and parameter edits retire it', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.check('#seed-toggle');
  await page.click('#geo-sample');

  const nextWord = independentSfc32(20_260_730);
  let sum = 0;
  let within = 0;
  let nearest = 0;
  const services = [
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 0, y: 8 },
    { x: -8, y: 0 },
    { x: 0, y: -8 },
  ];
  for (let i = 0; i < 2_000; i++) {
    const draw = independentPlanarDraw(0.5, { x: 0, y: 0 }, nextWord);
    sum += draw.radius;
    if (draw.radius <= 2) within += 1;
    const distances = services.map((service) => Math.hypot(draw.x - service.x, draw.y - service.y));
    if (distances.indexOf(Math.min(...distances)) === 0) nearest += 1;
  }
  expect(await asDataNumber(page.locator('#geo-sample-mean'))).toBeCloseTo(sum / 2_000, 13);
  expect(await asDataNumber(page.locator('#geo-sample-within'))).toBeCloseTo(within / 2_000, 14);
  expect(await asDataNumber(page.locator('#geo-nearest'))).toBeCloseTo(nearest / 2_000, 14);
  expect(await asDataNumber(page.locator('#geo-analytic-mean'))).toBeCloseTo(4, 14);
  expect(await asDataNumber(page.locator('#geo-analytic-within'))).toBeCloseTo(1 - 2 / Math.E, 14);

  await page.fill('#geo-eps', '0.75');
  await expect(page.locator('#geo-sample-out .verdict--idle')).toContainText('No planar samples drawn yet');
  await expect(page.locator('#geo-path-out .verdict--idle')).toContainText('No release transcript yet');
});

test('geo path inference uses the visible transcript and pays for every release', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.check('#seed-toggle');
  await page.click('#geo-path');

  const nextWord = independentSfc32(20_260_730);
  let loss = 0;
  for (let i = 0; i < 4; i++) {
    const a = { x: i * 0.75, y: 0 };
    const b = { x: i * 0.75, y: 1 };
    const release = independentPlanarDraw(0.5, a, nextWord);
    loss += 0.5 * (Math.hypot(b.x - release.x, b.y - release.y) - Math.hypot(a.x - release.x, a.y - release.y));
  }
  const posterior = 1 / (1 + Math.exp(-Math.abs(loss)));
  expect(await asDataNumber(page.locator('#geo-path-loss'))).toBeCloseTo(loss, 13);
  expect(await asDataNumber(page.locator('#geo-path-bound'))).toBeCloseTo(4 * 0.5 * 1, 14);
  expect(await asDataNumber(page.locator('#geo-path-posterior'))).toBeCloseTo(posterior, 13);
  await expect(page.locator('#geo-path-out tbody tr')).toHaveCount(4);
  await expect(page.locator('#geo-path-out')).toContainText(
    'that retained truth is not an input to the inference function'
  );
});

/**
 * L-R-11 — the release criteria, recomputed in the test from the rendered rows.
 *
 * None of these assertions reads a verdict label and believes it. Each one
 * parses the sixteen registry rows out of the page, re-derives the equivalence
 * classes, the band counts, the exact Earth Mover distance and the utility
 * interval with arithmetic written here, and only then compares with what the
 * page printed. The band boundaries are declared in the test rather than
 * imported, so a change to the lab's own domain cannot quietly change what the
 * test expects.
 */
// Exclusive upper bounds, independently restated from the learner-visible
// domain. The existing query is salary > $100,000, so exactly $100,000 stays
// in b3 and b4 begins at $100,001.
const BAND_EDGES = [60_000, 80_000, 100_001, 130_000];

function bandIndexOf(salary: number): number {
  let i = 0;
  while (i < BAND_EDGES.length && salary >= BAND_EDGES[i]!) i += 1;
  return i;
}

interface RegistryRow {
  age: number;
  zip: string;
  salary: number;
  band: number;
}

async function readRegistry(page: import('@playwright/test').Page): Promise<RegistryRow[]> {
  const rows = await page.locator('#div-table .data-table tbody tr').all();
  const out: RegistryRow[] = [];
  for (const row of rows) {
    const cells = await row.locator('td').allTextContents();
    const salary = Number(cells[2]!.replace(/[^0-9]/g, ''));
    out.push({
      age: Number(cells[0]),
      zip: cells[1]!.trim(),
      salary,
      band: bandIndexOf(salary),
    });
  }
  return out;
}

/** Absolute value of a bigint, written out so nothing is imported for it. */
const babs = (x: bigint): bigint => (x < 0n ? -x : x);

/** Exact ordered EMD, implemented here from the published formula. */
function emd(classCounts: number[], tableCounts: number[]): { n: bigint; d: bigint } {
  const m = BigInt(classCounts.length);
  const C = BigInt(classCounts.reduce((a, b) => a + b, 0));
  const N = BigInt(tableCounts.reduce((a, b) => a + b, 0));
  let cc = 0n;
  let ct = 0n;
  let sum = 0n;
  for (let i = 0; i < classCounts.length; i += 1) {
    cc += BigInt(classCounts[i]!);
    ct += BigInt(tableCounts[i]!);
    sum += babs(N * cc - C * ct);
  }
  const g = (a: bigint, b: bigint): bigint => (b === 0n ? a : g(b, a % b));
  const den = (m - 1n) * C * N;
  const k = g(sum, den) || 1n;
  return { n: sum / k, d: den / k };
}

test('the class table is the arithmetic the registry rows imply, not a label', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();

  const registry = await readRegistry(page);
  expect(registry).toHaveLength(16);
  expect(bandIndexOf(100_000)).toBe(2);
  expect(bandIndexOf(100_001)).toBe(3);
  const tableCounts = [0, 0, 0, 0, 0];
  for (const r of registry) tableCounts[r.band] += 1;
  expect(tableCounts).toEqual([4, 3, 3, 4, 2]);

  // Group the rows exactly as the selected release says it groups them: by age
  // decade, with the ZIP suppressed.
  await page.selectOption('#div-release', 'age-decade');
  const groups = new Map<string, RegistryRow[]>();
  for (const r of registry) {
    const decade = `${Math.floor(r.age / 10) * 10}–${Math.floor(r.age / 10) * 10 + 9}`;
    if (!groups.has(decade)) groups.set(decade, []);
    groups.get(decade)!.push(r);
  }

  const rendered = await page.locator('#div-class-body tr').all();
  expect(rendered).toHaveLength(groups.size);

  for (const row of rendered) {
    const header = (await row.locator('th').textContent())!;
    const decade = header.split('·')[1]!.trim();
    const members = groups.get(decade);
    expect(members, `no rows for decade ${decade}`).toBeDefined();

    const counts = [0, 0, 0, 0, 0];
    for (const m of members!) counts[m.band] += 1;
    const distinct = counts.filter((c) => c > 0).length;
    const expected = emd(counts, tableCounts);

    const cells = await row.locator('td').allTextContents();
    expect(Number(cells[0]), `size for ${decade}`).toBe(members!.length);
    expect(cells[1]!.replace(/\s/g, ''), `counts for ${decade}`).toBe(`[${counts.join(',')}]`);
    expect(Number(cells[2]), `distinct for ${decade}`).toBe(distinct);
    expect(cells[3]!.trim(), `EMD for ${decade}`).toBe(`${expected.n}/${expected.d}`);

    // And the pass/fail column must be the cross-multiplication against 9/64,
    // recomputed here rather than read.
    const withinT = expected.n * 64n <= 9n * expected.d;
    expect(cells[4]!.includes('within t'), `t verdict for ${decade}`).toBe(withinT);
  }
});

test('the similarity class is distinct 3-diverse and still over t, computed both ways', async ({
  page,
}) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.selectOption('#div-release', 'age-decade');

  const registry = await readRegistry(page);
  const thirties = registry.filter((r) => r.age >= 30 && r.age <= 39);
  const counts = [0, 0, 0, 0, 0];
  for (const r of thirties) counts[r.band] += 1;

  // Three distinct bands, none above the lab's $100,000 boundary, which is
  // band index 3. That is the similarity attack, derived from the rows.
  expect(counts.filter((c) => c > 0).length).toBe(3);
  expect(counts.slice(3).every((c) => c === 0)).toBe(true);

  const tableCounts = [0, 0, 0, 0, 0];
  for (const r of registry) tableCounts[r.band] += 1;
  const d = emd(counts, tableCounts);
  expect(d.n * 64n > 9n * d.d).toBe(true);

  const row = page.locator('#div-class-body tr', { hasText: '30–39' });
  await expect(row.locator('td').nth(3)).toHaveText(`${d.n}/${d.d}`);
  await expect(row.locator('td').nth(4)).toContainText('over t');
  await expect(page.locator('#div-out .verdict')).toContainText('still over t');
});

test('the repaired release passes t at equality and the page says what it cost', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();

  const registry = await readRegistry(page);
  const tableCounts = [0, 0, 0, 0, 0];
  for (const r of registry) tableCounts[r.band] += 1;

  await page.selectOption('#div-release', 'age-twenty');
  const halves = new Map<string, RegistryRow[]>();
  for (const r of registry) {
    const key = r.age < 40 ? '20–39' : '40–59';
    if (!halves.has(key)) halves.set(key, []);
    halves.get(key)!.push(r);
  }
  for (const [key, members] of halves) {
    const counts = [0, 0, 0, 0, 0];
    for (const m of members) counts[m.band] += 1;
    const d = emd(counts, tableCounts);
    // Exactly on the line, which the principle admits: "no more than t".
    expect(`${d.n}/${d.d}`, key).toBe('9/64');
  }
  await expect(page.locator('#div-out .verdict')).toContainText('Meets k');

  // The utility interval, recomputed from the same rows. Every class publishes
  // the range 20–39 or 40–59, so neither contains "in their thirties" and the
  // whole young half is merely possible.
  const truth = registry.filter((r) => r.age >= 30 && r.age <= 39).length;
  const possible = registry.filter((r) => r.age < 40).length;
  const utilityRow = page.locator('#div-utility-body tr').first();
  await expect(utilityRow.locator('td').nth(0)).toHaveText(String(truth));
  await expect(utilityRow.locator('td').nth(1)).toHaveText(`[0, ${possible}]`);
  await expect(utilityRow.locator('td').nth(2)).toHaveText(String(possible));

  // The release that FAILS t answers the same question exactly. That contrast
  // is the utility cost, and both halves of it are read off the page.
  await page.selectOption('#div-release', 'age-decade');
  await expect(utilityRow.locator('td').nth(1)).toHaveText(`[${truth}, ${truth}]`);
  await expect(utilityRow.locator('td').nth(2)).toHaveText('0');
});

test('the intersection is the one the two rendered candidate sets imply', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.click('#div-attack-run');

  const rows = await page.locator('#div-attack-body tr').all();
  expect(rows).toHaveLength(3);
  await expect(page.locator('#div-attack-out .verdict').first()).toContainText(
    'Two compliant releases, one exact band',
  );

  const registry = await readRegistry(page);
  await expect(page.locator('#div-table caption')).toContainText('not attacker-visible');
  const tableCounts = [0, 0, 0, 0, 0];
  for (const r of registry) tableCounts[r.band] += 1;
  const partitions = [
    (record: RegistryRow) => record.zip.slice(0, 3),
    (record: RegistryRow) => (record.age < 30 ? 'under 30' : '30 and over'),
  ];

  const sets: string[][] = [];
  for (const [index, row] of rows.slice(0, 2).entries()) {
    const cells = await row.locator('td').allTextContents();
    sets.push(cells[5]!.replace(/[{}\s]/g, '').split(',').filter(Boolean));

    // Rebuild each release from the raw teaching rows. The policy verdict is
    // accepted only after k, distinct ℓ and the release-wide maximum EMD have
    // all been recomputed here; this is the regression that prevents a merely
    // k/ℓ-compliant release from being called "two compliant releases" again.
    const grouped = new Map<string, RegistryRow[]>();
    for (const record of registry) {
      const key = partitions[index]!(record);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(record);
    }
    const classCounts = [...grouped.values()].map((members) => {
      const counts = [0, 0, 0, 0, 0];
      for (const member of members) counts[member.band] += 1;
      return { members, counts, distance: emd(counts, tableCounts) };
    });
    const k = Math.min(...classCounts.map((entry) => entry.members.length));
    const l = Math.min(...classCounts.map((entry) => entry.counts.filter((count) => count > 0).length));
    const max = classCounts.map((entry) => entry.distance).reduce((largest, distance) =>
      distance.n * largest.d > largest.n * distance.d ? distance : largest,
    );
    expect(Number(cells[0])).toBe(k);
    expect(Number(cells[1])).toBe(l);
    expect(cells[2]!.trim()).toBe(`${max.n}/${max.d}`);
    expect(max.n * 64n <= 9n * max.d).toBe(true);
    expect(cells[3]).toContain('passes k, ℓ and t');
  }

  const expected = sets[0]!.filter((b) => sets[1]!.includes(b));
  await expect(page.locator('#div-intersection')).toHaveText(`{${expected.join(', ')}}`);

  // Neither release settles the exact band or high-earner predicate on its own:
  // each candidate set straddles the $100,000 boundary, the b3/b4 edge.
  for (const set of sets) {
    expect(set.some((b) => b <= 'b3')).toBe(true);
    expect(set.some((b) => b >= 'b4')).toBe(true);
  }
  // Together they do not.
  expect(expected.every((b) => b >= 'b4')).toBe(true);

  // And the target's real band, which the attack never saw, is in the set.
  const targetRow = page.locator('#div-table tr.row--target td');
  const salary = Number((await targetRow.nth(2).textContent())!.replace(/[^0-9]/g, ''));
  expect(registry.some((r) => r.salary === salary)).toBe(true);
  expect(expected).toContain(`b${bandIndexOf(salary) + 1}`);
});

test('the deterministic-release counterexample is computed, and keeps its scope', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await page.click('#div-attack-run');

  const dp = page.locator('#div-attack-out .verdict').nth(1);
  await expect(dp).toContainText('differ');
  await expect(dp).toContainText('1 ≤ e^ε · 0');
  await expect(dp).toContainText('no finite ε satisfies that');

  // The scope caveats are part of the claim, not decoration.
  await dp.locator('.layered__more > summary').click();
  await expect(dp).toContainText('about THIS');
  await expect(dp).toContainText('could never appear inside some differentially private mechanism');
  await expect(dp).toContainText('does not stop a release teaching true things about a population');
});
