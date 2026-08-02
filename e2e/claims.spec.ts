import { expect, test } from '@playwright/test';

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
