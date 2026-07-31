/**
 * Task-level accessibility: can the lesson actually be completed?
 *
 * The axe sweep in `a11y.spec.ts` establishes conformance — no missing labels,
 * no contrast failures, no broken landmarks, in either theme. That is necessary
 * and it is not the same question as whether a dense mathematical interaction is
 * *operable*. A page can pass every automated WCAG check and still be impossible
 * to finish with a keyboard, or unreadable at 375px because a chart pushes the
 * body into horizontal scroll.
 *
 * So these tests complete the four core ideas the way a constrained reader would
 * have to, and assert the outcome the reader came for:
 *
 * - **Keyboard only.** No `click()` anywhere below — every control is reached by
 *   Tab and operated by Enter, Space or an arrow key, and the assertion is that
 *   the navigator reaches four of four.
 * - **At phone width.** The same journey at 375 × 667, plus the check that the
 *   document never scrolls sideways, which is the failure a viewBox change or a
 *   wide table reintroduces most easily.
 * - **Without the charts.** Every core conclusion is read out of the data
 *   disclosures instead of the SVG, because "equivalent access" has to mean the
 *   finding and not a description of a picture.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

/** Tab until `target` holds focus, so the route there is a real one. */
async function tabTo(page: Page, target: Locator, limit = 220): Promise<void> {
  for (let i = 0; i < limit; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`never reached ${await target.evaluate((el) => el.id || el.className)} in ${limit} tabs`);
}

/** Press an arrow key on a focused range input until its value changes. */
async function nudgeSlider(page: Page, slider: Locator): Promise<void> {
  const before = await slider.inputValue();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowLeft');
    if ((await slider.inputValue()) !== before) return;
  }
  throw new Error('slider did not respond to the arrow key');
}

test('the four core ideas can be established with a keyboard alone', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('.path__progress')).toContainText('0 of 4');

  // 1 — the differencing attack.
  await tabTo(page, page.locator('#leak-run'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#leak-out .verdict')).toContainText('recovered exactly');
  await expect(page.locator('.path__progress')).toContainText('1 of 4');

  // 2 — move the two neighbouring worlds.
  const eps = page.locator('#def-eps');
  await tabTo(page, eps);
  await nudgeSlider(page, eps);
  await expect(page.locator('.path__progress')).toContainText('2 of 4');

  // 3 — the same ε against a different sensitivity. A native select is operated
  // from the keyboard by the browser's own popup, which Playwright cannot drive;
  // `selectOption` is the documented stand-in and it dispatches the same events
  // the keyboard would. Everything either side of it is real key input.
  await page.selectOption('#dial-query', 'sum-salary');
  await expect(page.locator('.path__progress')).toContainText('3 of 4');

  // 4 — the averaging attack, then the refusal.
  const n = page.locator('#avg-n');
  await tabTo(page, n);
  await nudgeSlider(page, n);
  await tabTo(page, page.locator('#avg-run'));
  await page.keyboard.press('Enter');
  await expect(page.locator('#avg-out .verdict')).toContainText('recovered to within', { timeout: 60_000 });

  for (let i = 0; i < 4; i++) {
    await tabTo(page, page.locator('#ask-sum'));
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#bud-out .verdict')).toContainText('Refused');
  await expect(page.locator('.path__progress')).toContainText('4 of 4');
});

/**
 * Completion has to be *earned by the reader's own interaction with that
 * exhibit*, which is a stronger claim than "something changed".
 *
 * Linked ε means moving the dial's slider also moves the definition's, and an
 * earlier version of this page treated the resulting re-render as the reader
 * having established the definition — so dragging one control ticked off an
 * idea nobody had looked at. The navigator's whole credibility rests on that
 * not happening, and nothing else in the suite would have caught it.
 */
test('a linked ε sync does not establish another exhibit’s step', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('.path__progress')).toContainText('0 of 4');

  // Move ε on the dial. Linking must carry the value to Exhibit 2...
  await page.locator('#dial-eps').fill('4');
  await expect(page.locator('#def-eps')).toHaveValue('4');
  await expect(page.locator('#def-eps-value')).toHaveText('0.2');

  // ...and must not carry the credit for having understood it.
  const definitionStep = page.locator('.path__step').nth(1);
  await expect(definitionStep).toContainText('Not yet established');
  await expect(page.locator('.path__progress')).toContainText('0 of 4');

  // The reader moving *this* slider is what establishes it.
  await page.locator('#def-eps').fill('6');
  await expect(definitionStep).toContainText('Established');
  await expect(page.locator('.path__progress')).toContainText('1 of 4');
});

test('the navigator names one next action, and it advances', async ({ page }) => {
  await page.goto('.');
  // Exactly one step is marked, and it is the first.
  await expect(page.locator('.path__step--next')).toHaveCount(1);
  await expect(page.locator('.path__step').first()).toContainText('Start here');

  await page.click('#leak-run');
  await expect(page.locator('.path__step--next')).toHaveCount(1);
  await expect(page.locator('.path__step').nth(1)).toContainText('Start here');
  await expect(page.locator('.path__step').first()).not.toContainText('Start here');
});

test('a revisit pointer into expert-gated material brings the route with it', async ({ page }) => {
  await page.goto('.');
  // The k-anonymity panel is set aside on the guided route.
  await expect(page.locator('#leak [data-depth="expert"]')).toBeHidden();

  // Answer the anonymisation scenario wrongly to summon its pointer.
  await page.click('#x-anonymisation-0');
  const pointer = page.locator('#x-anonymisation-q').locator('..').locator('.exit__revisit a');
  await expect(pointer).toContainText('k = 6');
  // The link says what it is about to do, rather than doing it silently.
  await expect(page.locator('#x-anonymisation-q').locator('..')).toContainText('switches you to the Explore route');

  await pointer.click();
  await expect(page.locator('#leak [data-depth="expert"]')).toBeVisible();
});

test('the guided path completes at phone width without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('.');

  const noOverflow = async (where: string): Promise<void> => {
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { scroll: doc.scrollWidth, client: doc.clientWidth };
    });
    // One pixel of slack for sub-pixel layout rounding; anything more is a real
    // element sticking out of the viewport.
    expect(overflow.scroll, `horizontal overflow at ${where}`).toBeLessThanOrEqual(overflow.client + 1);
  };

  await noOverflow('first load');

  await page.click('#leak-run');
  await expect(page.locator('#leak-out .verdict')).toContainText('recovered exactly');
  await noOverflow('after the differencing attack');

  await page.locator('#def-eps').fill('4');
  await noOverflow('after moving ε');

  await page.selectOption('#dial-query', 'sum-salary');
  await page.click('#dial-release');
  await expect(page.locator('#dial-release-out .chip').first()).toBeVisible();
  await noOverflow('after releasing the payroll total');

  await page.locator('#avg-n').fill('40');
  await page.click('#avg-run');
  await expect(page.locator('#avg-out .verdict')).toContainText('recovered to within', { timeout: 60_000 });
  for (let i = 0; i < 4; i++) await page.click('#ask-sum');
  await expect(page.locator('#bud-out .verdict')).toContainText('Refused');
  await noOverflow('after the budget refusal');

  await expect(page.locator('.path__progress')).toContainText('4 of 4');

  // Open every disclosure at this width too — a wide data table is the most
  // likely thing to break the layout, and it is collapsed by default.
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await noOverflow('with every disclosure open');
});

test('every core conclusion is readable without the charts', async ({ page }) => {
  await page.goto('.');
  await page.locator('.path__route', { hasText: 'Explore everything' }).click();

  // Remove the SVGs outright, then read the findings out of the disclosures.
  // This is stronger than trusting an aria-label: it asserts the numbers exist
  // in text, not that the picture was described.
  await page.evaluate(() => document.querySelectorAll('svg.chart').forEach((s) => s.remove()));
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));

  // Exhibit 2: the ratio and its rails, as a column of numbers.
  const defData = page.locator('#def-ratio .data-details');
  await expect(defData).toContainText('ln(ratio)');
  await expect(defData).toContainText('What to notice');

  // Exhibit 4: the trade-off, at every ε, with the selected row marked.
  const dialData = page.locator('#dial-curve .data-details');
  await expect(dialData).toContainText('← selected');
  await expect(dialData).toContainText('Belief can reach');

  // Exhibit 5: the attack's two columns — error falling, ε rising.
  await page.locator('#avg-n').fill('40');
  await page.click('#avg-run');
  await expect(page.locator('#avg-out .verdict')).toContainText('recovered to within', { timeout: 60_000 });
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  const avgData = page.locator('#avg-chart .data-details');
  await expect(avgData).toContainText('Predicted error');
  await expect(avgData).toContainText('Sampled versus theoretical');
});
