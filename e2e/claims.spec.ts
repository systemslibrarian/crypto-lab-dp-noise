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
