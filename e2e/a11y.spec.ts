import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function freeze(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important}`,
  });
}

async function openEverything(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => (d.open = true));
    document.querySelectorAll<HTMLElement>('[hidden]').forEach((el) => el.removeAttribute('hidden'));
  });
}

/**
 * Scans one state. `include` narrows the scan to the exhibit that just changed:
 * re-scanning the whole page after every interaction re-checks thousands of
 * already-cleared nodes, which pushes the sweep past its timeout on a CI runner.
 * Every state is still scanned, and `driveAll` finishes with one full-page pass
 * so landmarks, heading order and the shared chrome are covered too.
 */
async function scan(page: Page, label: string, include?: string): Promise<void> {
  // Deep readouts live behind disclosures; open them all first, because an
  // unscanned state is an ungated state.
  await openEverything(page);
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  if (include) builder.include(include);
  const { violations } = await builder.analyze();
  expect(
    violations.map((v) => ({
      state: label,
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
    })),
  ).toEqual([]);
}

/** All four prediction checks, left answered so later scans see a verdict. */
async function drivePredictions(page: Page): Promise<void> {
  await page.click('#pr-epsilon-0');
  await expect(page.locator('#pr-epsilon .verdict')).toContainText('Not quite');
  await page.click('#pr-epsilon-1');
  await expect(page.locator('#pr-epsilon .verdict')).toContainText('Correct');
  await page.click('#pr-aggregate-1');
  await expect(page.locator('#pr-aggregate .verdict')).toContainText('Correct');
  await page.click('#pr-anon-0');
  await expect(page.locator('#pr-anon .verdict')).toContainText('Not quite');
  await page.click('#pr-repeat-1');
  await expect(page.locator('#pr-repeat .verdict')).toContainText('Correct');
}

/** Exhibit 1: the differencing attack in both modes, and every k-anonymity level. */
async function driveLeak(page: Page): Promise<void> {
  await page.click('#leak-run');
  await expect(page.locator('#leak-out .verdict')).toContainText('recovered exactly');
  await page.selectOption('#leak-mode', 'dp');
  await expect(page.locator('#leak-out .verdict')).toContainText('Attack failed');
  await page.click('#leak-run');
  await expect(page.locator('#leak-out .verdict')).toContainText('Attack failed');
}

async function driveAnonymity(page: Page): Promise<void> {
  for (const level of ['raw', 'age-banded', 'k6', 'k3']) {
    await page.selectOption('#kanon-level', level);
    await expect(page.locator('#kanon-out .verdict')).toContainText('anonymous');
  }
}

/** Exhibit 2, across the ε range and both mechanisms. */
async function driveDefinition(page: Page): Promise<void> {
  await expect(page.locator('#def-guarantee .verdict')).toContainText('rails hold');
  await page.locator('#def-eps').fill('0');
  await expect(page.locator('#def-eps-value')).toHaveText('0.01');
  await page.locator('#def-eps').fill('14');
  await expect(page.locator('#def-eps-value')).toHaveText('10');
  await page.locator('#def-eps').fill('8');
  await page.selectOption('#def-mech', 'gaussian');
  await expect(page.locator('#def-guarantee .verdict')).toContainText('rails do not hold');
}

/** Exhibit 3: the real sampler, then several rounds of the guessing game. */
async function driveGuess(page: Page): Promise<void> {
  await page.click('#guess-sample');
  await expect(page.locator('#guess-sample-out .verdict')).toContainText('agree to', { timeout: 60_000 });
  await expect(page.locator('#guess-sample')).toBeEnabled();

  for (let i = 0; i < 12; i++) {
    await page.click('#guess-deal');
    await expect(page.locator('#guess-out .deal__value')).toBeVisible();
    await page.click(i % 2 === 0 ? '#guess-yes' : '#guess-no');
  }
  // Twelve rounds is past the threshold where the page starts commenting on the
  // score, so that verdict gets scanned too.
  await expect(page.locator('#guess-out .verdict').last()).toBeVisible();
}

/** Exhibit 4: every query against every mechanism, plus both release panels. */
async function driveDial(page: Page): Promise<void> {
  for (const kind of ['discrete-laplace', 'discrete-gaussian', 'continuous-laplace', 'exact']) {
    await page.selectOption('#dial-mech', kind);
    await page.click('#dial-release');
    await expect(page.locator('#dial-release-out .chip').first()).toBeVisible();
  }
  await page.selectOption('#dial-mech', 'discrete-laplace');
  for (const query of ['headcount', 'sum-salary', 'count-high']) {
    await page.selectOption('#dial-query', query);
    await page.click('#dial-release');
    await expect(page.locator('#dial-release-out .chip').first()).toBeVisible();
  }
  await page.locator('#dial-eps').fill('2');
  await page.click('#dial-mean');
  await expect(page.locator('#dial-mean-out .verdict')).toContainText('division was free');
}

/** Exhibit 5: spend the budget until it refuses, then run the averaging attack. */
async function driveBudget(page: Page): Promise<void> {
  await page.selectOption('#bud-budget', '1.5');
  // Three at ε = 0.5 lands exactly on the budget — admitted, and exhausted.
  for (let i = 0; i < 3; i++) await page.click('#ask-sum');
  await expect(page.locator('#bud-out .verdict')).toContainText('Answered');
  await expect(page.locator('.meter__fill--full')).toBeVisible();
  // The fourth is over, so it must be refused rather than answered.
  await page.click('#ask-count');
  await expect(page.locator('#bud-out .verdict')).toContainText('Refused');
  await page.click('#bud-reset');
  await page.click('#ask-head');
  await expect(page.locator('#bud-out .verdict')).toContainText('Answered');

  await page.locator('#avg-n').fill('100');
  await page.click('#avg-run');
  await expect(page.locator('#avg-out .verdict')).toContainText('recovered to within', { timeout: 60_000 });
}

async function driveAll(page: Page): Promise<void> {
  await freeze(page);
  await drivePredictions(page);
  await scan(page, 'prediction checks answered', '#intro');
  await driveLeak(page);
  await scan(page, 'the differencing attack, both modes', '#leak');
  await driveAnonymity(page);
  await scan(page, 'k-anonymity at every generalisation', '#leak');
  await driveDefinition(page);
  await scan(page, 'the definition under the Gaussian mechanism', '#definition');
  await page.selectOption('#def-mech', 'laplace');
  await scan(page, 'the definition under the Laplace mechanism', '#definition');
  await driveGuess(page);
  await scan(page, 'sampled histograms and the guessing game', '#guess');
  await driveDial(page);
  await scan(page, 'the privacy/utility dial', '#dial');
  await driveBudget(page);
  await scan(page, 'the budget ledger and the averaging attack', '#budget');
  await scan(page, 'the deployments panel', '#wild');
  // One whole-page pass with every exhibit in its final state.
  await scan(page, 'the finished page, end to end');
}

test('no WCAG A/AA violations — dark theme', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await driveAll(page);
});

test('no WCAG A/AA violations — light theme', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await driveAll(page);
});
