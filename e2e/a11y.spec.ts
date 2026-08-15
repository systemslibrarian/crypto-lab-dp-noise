import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches, on BOTH of its routes.
 *
 * The guided route first, because that is what the page ships and it is a
 * genuinely different document — five panels removed with `hidden`, and
 * Exhibit 5's cards physically re-ordered so the averaging attack comes before
 * the ledger. Within it: the skip link focused; the jargon glossary opened
 * through its summary; classroom mode on and off; each prediction check answered
 * wrong and then right; the differencing attack recovering Alice exactly and
 * then failing under DP; ε driven to both ends of its ladder and the mechanism
 * switched to the Gaussian, where the rails stop holding; all four dial
 * mechanisms including the two labelled-broken ones; the lattice disclosure that
 * only the payroll query on a discrete mechanism renders; a release at ε = 0.01
 * where answers come back negative; an ε past the budget, where the linked
 * readout starts quoting a refusal; all four declared bounds and all three
 * decisions about the record that does not fit, including the one the page
 * REFUSES; the ledger spent to exactly exhausted and then past it into a
 * refusal; a reset; and the averaging attack recovering the true payroll.
 *
 * Then the route chooser, and the material the guided route had set aside:
 * k-anonymity at every generalisation, post-processing, the composition
 * crossover, the deployments, and the guessing experiment — including its
 * disabled prerequisite state, two thousand real releases, and ten rounds of the
 * game, which is the threshold past which the page starts commenting on the
 * score. Finally the exit challenge, wrong then right, and every disclosure on
 * the page opened.
 *
 * Every one of those states is scanned, in both themes, at desktop and phone
 * width.
 *
 * See `gate.ts` for why nothing is injected into the page, why `[hidden]` is
 * never stripped (the old gate did, and so never once measured the route this
 * page ships on), why no `<details>` is force-opened, why the lab's defaults are
 * asserted rather than assumed, and why `violations` is not the whole oracle.
 */

for (const theme of ['dark', 'light'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(900_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
