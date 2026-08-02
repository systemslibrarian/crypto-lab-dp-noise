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

/**
 * The guided route removes the expert panels, so almost every drive below would
 * be clicking a hidden element. Switch once, up front; the guided state is
 * scanned before this runs and the navigator is scanned again at the end.
 */
async function switchToExplore(page: Page): Promise<void> {
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();
  await expect(page.locator('#guess')).toBeVisible();
}

/** The bounded-sensitivity exercise: every bound, and all three decisions. */
async function driveBounds(page: Page): Promise<void> {
  for (const hi of ['100000', '150000', '500000', '250000']) {
    await page.selectOption('#bound-hi', hi);
    await expect(page.locator('#bound-out .stat').first()).toBeVisible();
  }
  await page.click('#bound-clip');
  await expect(page.locator('#bound-decision-out .verdict')).toContainText('biased by a known amount');
  await page.click('#bound-reject');
  await expect(page.locator('#bound-decision-out .verdict')).toContainText('different question');
  // The refusal is the one that has to be scanned in both themes: it is the
  // only place on the page where a chosen option is answered with "no".
  await page.click('#bound-expand');
  await expect(page.locator('#bound-decision-out .verdict')).toContainText('not a private calibration');
}

/**
 * The exit challenge. A wrong answer first, so the "revisit this" verdict and
 * its pointer link get scanned, then the correct answer to every question.
 * The correct option sits at a different index in each — deliberately, so a
 * reader cannot pattern-match position — hence the varied indices here.
 */
async function driveExit(page: Page): Promise<void> {
  await page.click('#x-sensitivity-0');
  await expect(page.locator('#exit-result .verdict')).toContainText('to revisit');
  await page.click('#x-sensitivity-1');
  await page.click('#x-composition-0');
  await page.click('#x-anonymisation-2');
  await page.click('#x-delta-1');
  await expect(page.locator('#exit-result .verdict')).toContainText('All four transferred');
}

/** Classroom mode on, then off — both labels get scanned. */
async function driveTeaching(page: Page): Promise<void> {
  await page.check('#seed-toggle');
  await expect(page.locator('#teaching-mode .note')).toContainText('Reproducible classroom run');
  await page.uncheck('#seed-toggle');
  await expect(page.locator('#teaching-mode .note')).toContainText('Live cryptographic randomness');
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
  // The guided route as a first-time reader meets it: navigator, objectives,
  // classroom switch, and the expert panels genuinely absent.
  await scan(page, 'the guided route, nothing established yet');
  await driveTeaching(page);
  await scan(page, 'classroom mode toggled on and off', '#intro');
  await switchToExplore(page);
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
  await driveBounds(page);
  await scan(page, 'the bounded-sensitivity exercise, all three decisions', '#bounds');
  await driveBudget(page);
  await scan(page, 'the budget ledger and the averaging attack', '#budget');
  await scan(page, 'the deployments panel', '#wild');
  await driveExit(page);
  await scan(page, 'the exit challenge, answered', '#exit');
  // The navigator with all four ideas established, which is a different render
  // from the one scanned at the top of this sweep.
  await scan(page, 'the core path, complete', '#path');
  // One whole-page pass with every exhibit in its final state.
  await scan(page, 'the finished page, end to end');
}

/**
 * SC 1.4.11 (non-text contrast): every text-entry control boundary (select,
 * text input, textarea) must reach 3:1 against the adjacent surface and the
 * field's own fill, in both themes. Axe does not flag border-vs-surface, so
 * this composites rendered computed styles over the real ancestor backdrop
 * and asserts the worst pairing directly.
 */
async function controlBorderContrasts(
  page: Page,
): Promise<Array<{ id: string; ratio: number }>> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    const parse = (s: string): C => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return { r: 0, g: 0, b: 0, a: 0 };
      const p = m[1].split(/[,\s/]+/).map(parseFloat);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (fg: C, bg: C): C => {
      const a = fg.a + bg.a * (1 - fg.a);
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    };
    const lum = (c: C) => {
      const f = (v: number) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C) => {
      const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)];
      return (hi + 0.05) / (lo + 0.05);
    };
    const backdrop = (start: Element | null): C => {
      const stack: C[] = [];
      for (let n = start; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) {
          stack.push(c);
          if (c.a >= 1) break;
        }
      }
      let out: C = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
      return out;
    };
    const out: Array<{ id: string; ratio: number }> = [];
    document
      .querySelectorAll<HTMLElement>("select, textarea, input[type='text']")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        const cs = getComputedStyle(el);
        if (parseFloat(cs.borderTopWidth) === 0) return;
        const outside = backdrop(el.parentElement);
        const fillRaw = parse(cs.backgroundColor);
        const fill = fillRaw.a > 0 ? over(fillRaw, outside) : outside;
        const border = over(over(parse(cs.borderTopColor), fill), outside);
        out.push({
          id: el.id || el.tagName.toLowerCase(),
          ratio: Math.min(ratio(border, outside), ratio(border, fill)),
        });
      });
    return out;
  });
}

async function assertControlBorders(page: Page): Promise<void> {
  await switchToExplore(page);
  await openEverything(page);
  const results = await controlBorderContrasts(page);
  expect(results.length).toBeGreaterThan(0);
  for (const { id, ratio } of results) {
    expect(ratio, `#${id} border contrast`).toBeGreaterThanOrEqual(3);
  }
}

test('control borders reach 3:1 — dark theme (SC 1.4.11)', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await assertControlBorders(page);
});

test('control borders reach 3:1 — light theme (SC 1.4.11)', async ({ page }) => {
  await page.goto('.');
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await assertControlBorders(page);
});

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
