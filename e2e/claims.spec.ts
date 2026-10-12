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
