import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Five rules govern everything here, each one a correction of the gate this
 * replaces. That gate was better than most in this fleet — it genuinely drove
 * every exhibit and it scanned more than once — so what was wrong with it is
 * worth being precise about.
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. `freeze()` pushed
 *     `animation:none!important; transition:none!important` through
 *     `addStyleTag` before the sweep. On this page that suppressed nothing at
 *     all: `style.css` declares no `@keyframes` and not one `animation`
 *     property in 1431 lines, and its only `transition` is `filter 160ms` on
 *     `.btn:hover`. Meanwhile the reduced-motion behaviour this page ACTUALLY
 *     has is in JavaScript, where a style tag cannot reach it — `dom.ts`'s
 *     `chunked()` reads `matchMedia('(prefers-reduced-motion: reduce)')` and
 *     either does the whole batch synchronously or spreads it across animation
 *     frames. So the injection froze a page with nothing to freeze while the one
 *     branch that reduced motion really changes went untested. This gate asks
 *     for the preference, ASSERTS it took effect, and therefore drives the
 *     synchronous branch of every sampler on the page.
 *
 *     The stylesheet's own `@media (prefers-reduced-motion: reduce)` block was
 *     checked for the defect where a block cancels motion without restoring the
 *     end state: it sets `scroll-behavior: auto` and clamps `animation-duration`
 *     and `transition-duration` to 0.001ms. Those are duration properties, not
 *     visibility ones, so nothing can be stranded mid-transition — and
 *     `expectNotBlank` measures that rather than trusting it.
 *
 *  2. IT REMOVED `[hidden]` FROM EVERY ELEMENT, and force-opened every
 *     `<details>`, before EVERY scan — `openEverything()` ran at the top of
 *     `scan()`. That is the most consequential of the five. The guided route's
 *     entire mechanism is `hidden`: `path.ts` toggles it on five
 *     `[data-depth="expert"]` nodes, and stripping the attribute meant the gate
 *     never once scanned the guided route as a reader receives it, and instead
 *     scanned a document with BOTH routes' content on screen at the same time —
 *     a page no visitor can load. This gate never touches `hidden`; it asserts
 *     the five panels are really gone on the guided route, drives that route in
 *     full, then switches with the route chooser and drives the other one.
 *     Every `<details>` is opened by clicking its own `<summary>`.
 *
 *  3. IT SCANNED AT ONE VIEWPORT, AND MOSTLY NOT THE WHOLE PAGE. Every scan but
 *     two passed `include` to narrow axe to the exhibit that had just changed,
 *     to keep the sweep inside its timeout. That is a real cost — a full pass
 *     here is ~500ms against 1100 text-owning elements — but the effect was that
 *     a change in one exhibit was never checked against the rest of the page it
 *     had just changed. This gate scans the WHOLE page every time, in
 *     {dark, light} × {1280, 380}. It is affordable because the arithmetic
 *     contrast walk memoises styles and rects per pass.
 *
 *  4. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Note especially that all
 *     three verdict surfaces on this page are `color-mix()`, which axe files
 *     under `incomplete` — so the old assertion had measured the contrast of not
 *     one verdict the page renders.
 *
 *  5. ITS 1.4.11 CHECK LOOKED WHERE THE RULE WAS ALREADY KEPT. The old spec
 *     carried a good bespoke non-text-contrast check, and pointed it at
 *     `select, textarea, input[type='text']` — exactly the three controls the
 *     palette's `--control-border` token was written for and correctly applied
 *     to. Every BUTTON-shaped control on the page draws its boundary from
 *     `--border-strong` instead, which is a surface divider, and none of them
 *     was ever measured. See `auditControlBoundaries`.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Transitions drain in waves, not in one batch, so a poll for "nothing running
 * right now" can exit through a gap between waves. Require quiescence to hold
 * for several consecutive frames instead.
 */
export async function settle(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __quietFrames?: number };
      const running = document.getAnimations().filter((a) => a.playState === 'running');
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      return w.__quietFrames >= 6;
    },
    undefined,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion block
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 *
 * This page cannot currently be in that shape, and the assertion is what makes
 * that a measurement: `style.css` contains no `@keyframes`, no `animation`
 * property and — checked separately — not a single `opacity` declaration
 * anywhere in it. Its reduced-motion block only clamps durations. The check runs
 * in every state regardless, because all three of those are properties of the
 * current stylesheet rather than of the page, and this is the cheapest place to
 * catch the first exception.
 *
 * `aria-hidden` subtrees are excluded. The cost of that exclusion is stated
 * plainly: text removed from the accessibility tree AND painted at zero opacity
 * is not checked here — which on this page would mean the seven SVG charts,
 * whose labels are instead measured by hand (see the header of `contrast.ts`).
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. A renderer that throws halfway through leaves an earlier state on
 * screen, and a gate that scans that state reports green for a page that is
 * broken. Attach before `boot`, assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

/**
 * Exactly one banner landmark: the shared bar.
 *
 * This page puts its hero INSIDE `<main id="app">`, which scopes the hero
 * `<header>` out of the banner role on its own — and `index.html`'s
 * `dedupeBanner()` explicitly skips it for that reason (`el.closest('main, …')`
 * returns early). So unlike most labs in this fleet, nothing here demotes
 * anything; the single banner is a property of the markup. Asserting the OUTCOME
 * rather than either mechanism means a change to the nesting is caught too.
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/** The five panels the guided route sets aside, and what each one holds. */
export const EXPERT_PANELS = [
  { sel: '#guess', holds: 'the guessing experiment' },
  { sel: '#wild', holds: 'the deployment accounting' },
  { sel: '#kanon-level', holds: 'k-anonymity and the homogeneity attack' },
  { sel: '#dial-mean', holds: 'post-processing' },
  { sel: '#bud-composition', holds: 'the composition rules and their crossover' },
] as const;

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including the
 * lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. An emulation that silently did nothing would
 * leave the gate certifying a different rendering than the one it claims to, and
 * here it would specifically mean `chunked()` spreading every histogram across
 * animation frames instead of taking the synchronous branch a reduced-motion
 * reader gets.
 *
 * The theme is seeded through `localStorage` rather than by clicking the toggle,
 * which also pins down a real failure mode: `index.html`'s anti-flash script
 * reads `localStorage.getItem('theme')` and the toggle writes
 * `localStorage.setItem('theme', …)`. If those keys ever drift apart the theme
 * silently stops persisting, and this boot fails on the `data-theme` assertion
 * rather than quietly scanning dark twice.
 *
 * The defaults are asserted at length because on this page they decide which
 * HALF of the document exists. It ships on the GUIDED route, and the guided
 * route deletes five panels — the guessing experiment, the deployments, the
 * k-anonymity attack, post-processing, and the composition crossover — with the
 * `hidden` attribute. The gate this replaces stripped that attribute before
 * every scan, so it never saw this state at all. It also ships `linked`, at
 * ε index 8 (ε = 1), on the `count-high` query, with classroom seeding OFF, with
 * `#kanon-level` already at its STRONGEST generalisation (`k3`, not `raw`), and
 * with `#bound-hi` at $250,000 — each of which is one end of a range whose other
 * end is a different rendering.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the whole
  // test timeout and reports nothing useful. 20s turns that silent hang into a
  // named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await assertSingleBanner(page);

  // Every section in the markup, plus the JS-mounted navigator and objectives.
  for (const id of ['intro', 'leak', 'definition', 'dial', 'bounds', 'budget', 'recap', 'exit', 'scope']) {
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
  await expect(page.locator('#path .path__steps > li')).toHaveCount(4);
  await expect(page.locator('#objectives li')).toHaveCount(4);

  // ── The shipped route is GUIDED, and it really does remove five panels ────
  await expect(page.locator('#app')).toHaveAttribute('data-route', 'guided');
  const routes = page.locator('.path__route');
  await expect(routes.nth(0)).toHaveAttribute('aria-pressed', 'true');
  await expect(routes.nth(1)).toHaveAttribute('aria-pressed', 'false');
  // Probe with the ASSERTION, not the property. Playwright's `el.hidden` reads
  // the attribute; `toBeHidden()` reads the rendering, and the two disagree
  // exactly when an author `display` outranks the UA's `[hidden]` rule — which
  // is the defect `style.css`'s blanket `[hidden]{display:none!important}`
  // exists to prevent. Asserting the rendering is what proves that rule is
  // still winning.
  for (const { sel } of EXPERT_PANELS) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('.path__withheld')).toBeVisible();

  // ── Every other shipped default ──────────────────────────────────────────
  await expect(page.locator('#seed-toggle')).not.toBeChecked();
  await expect(page.locator('#leak-mode')).toHaveValue('exact');
  await expect(page.locator('#def-eps')).toHaveValue('8');
  await expect(page.locator('#def-eps-value')).toHaveText('1');
  await expect(page.locator('#def-mech')).toHaveValue('laplace');
  await expect(page.locator('#dial-eps')).toHaveValue('8');
  await expect(page.locator('#dial-query')).toHaveValue('count-high');
  await expect(page.locator('#dial-mech')).toHaveValue('discrete-laplace');
  // The strongest generalisation, not the weakest — the opposite end from where
  // a reader would guess an exhibit about anonymisation failure starts.
  await expect(page.locator('#kanon-level')).toHaveValue('k3');
  await expect(page.locator('#bound-hi')).toHaveValue('250000');
  await expect(page.locator('#bud-budget')).toHaveValue('1.5');
  await expect(page.locator('#avg-n')).toHaveValue('600');

  // Nothing has been run: no exhibit has produced a verdict, and the navigator
  // reports none of the four ideas established.
  await expect(page.locator('#path .path__progress')).toHaveText('0 of 4 core ideas established');
  await expect(page.locator('.path__step--done')).toHaveCount(0);
  // "Nothing run yet" is a RENDERED state here, not an absence: every output
  // region ships an explicit `--idle` verdict rather than an empty div, which
  // is its own copy and its own tone and is scanned as such.
  await expect(page.locator('#leak-out .verdict--idle')).toContainText('Nothing run yet');
  await expect(page.locator('#exit-result .verdict--idle')).toContainText(
    'Four scenarios, none of them from this page'
  );
  await expect(page.locator('#guess-chart .verdict--idle')).toContainText('No samples drawn yet');
  await expect(page.locator('#dial-release-out .verdict--idle')).toContainText(
    'No answer released yet'
  );
  await expect(page.locator('#avg-out .verdict--idle')).toContainText('Not run yet');
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');
  // These two really are empty until something is clicked.
  await expect(page.locator('#bud-out')).toBeEmpty();
  await expect(page.locator('#guess-sample-out')).toBeEmpty();

  // Ten disclosures ship on the page and every one ships SHUT: the jargon
  // glossary in the markup, plus a data-table alternative under each chart.
  await expect(page.locator('details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all, and this page is
 * the shape that breaks it: eleven sections of wide tables (a twelve-row
 * payroll, eight deployment rows with provenance prose, the equivalence-class
 * table, the released-answers ledger) and seven SVG charts. Each table is meant
 * to scroll inside its own `.scroller`; the assertion here is that none of them
 * scrolls the DOCUMENT.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow-x: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. That cost
    // a run elsewhere in this fleet, and this page has a decoy behind every
    // `.scroller`.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1). If
 * it holds no focusable content it needs `tabindex="0"`, so it becomes a focus
 * target arrow keys can then scroll.
 *
 * This lab already handles its known case — `dom.ts`'s `scroller()` builds every
 * one with `role="region"`, `tabindex="0"` and an `aria-label`, and it is the
 * only route by which a wide table gets on this page. The assertion stays
 * because the helper is a convention, not an enforcement, and because the
 * content inside those scrollers is the evidence for most of what the page
 * claims: the payroll it attacks, the equivalence classes, the ledger, and the
 * data-table alternative that is the accessible form of every chart.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return (
          ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY)
        );
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * SC 1.4.11 (non-text contrast) for interactive controls: a control's boundary
 * has to be perceivable against what surrounds it.
 *
 * This is the old spec's check, kept because it was right, with its aim
 * corrected. It used to query `select, textarea, input[type='text']` — which is
 * exactly the set the palette's `--control-border` token was written for, and
 * correctly applied to. Pointing a check only at the place a rule is already
 * kept is the same as not having it, and every BUTTON-shaped control on this
 * page draws its border from `--border-strong`, a SURFACE divider, which was
 * never measured against anything.
 *
 * A control passes if EITHER
 *   - its fill differs from the surface behind it (how `.btn` works: a
 *     transparent border over an `--accent` fill), or
 *   - it has a border that stands out from the surface behind it AND from its
 *     own fill (how a `<select>` works: a near-panel fill with a drawn edge).
 * so the score is `max(fill-vs-outside, min(border-vs-outside, border-vs-fill))`.
 * Taking the max of the two mechanisms is what keeps this from failing a
 * perfectly delineated solid button for having no border.
 *
 * Two deliberate exclusions:
 *  - `disabled` controls. WCAG exempts inactive components, and this page ships
 *    `#guess-yes` / `#guess-no` disabled until a release has been dealt.
 *  - anything outside `#app`. The shared top bar is not this lab's to change —
 *    every repo in the fleet carries a copy — and its `.cl-btn` boundary
 *    (`color-mix(in srgb, var(--accent) 38%, transparent)` over `#0b1512`)
 *    measures 1.68:1 in dark and 1.23:1 in light here. That is reported upward
 *    as a fleet-wide observation rather than patched in one repo, and it is
 *    written down here so the exclusion is a decision and not an oversight.
 */
export async function auditControlBoundaries(
  page: Page
): Promise<Array<{ sel: string; ratio: number }>> {
  return page.evaluate(() => {
    type C = { r: number; g: number; b: number; a: number };
    // Resolve through a canvas rather than a regex: this palette is full of
    // `color-mix()`, which `getComputedStyle` reports unchanged and which a
    // regex reads as null — landing the walk on the wrong backdrop.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 1;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    const parse = (s: string): C => {
      if (!s) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = s;
      const a = ctx.fillStyle;
      ctx.fillStyle = '#fff';
      ctx.fillStyle = s;
      if (a !== ctx.fillStyle) return { r: 0, g: 0, b: 0, a: 0 };
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const over = (fg: C, bg: C): C => {
      const a = fg.a + bg.a * (1 - fg.a);
      if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    };
    const lum = (c: C): number => {
      const f = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (a: C, b: C): number => {
      const la = lum(a);
      const lb = lum(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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
    const describe = (el: Element): string => {
      const cls = el.getAttribute('class');
      return (
        el.tagName.toLowerCase() +
        (el.id ? `#${el.id}` : '') +
        (cls ? `.${cls.trim().split(/\s+/).join('.')}` : '')
      );
    };

    const out: Array<{ sel: string; ratio: number }> = [];
    const app = document.getElementById('app');
    if (!app) return out;
    app
      .querySelectorAll<HTMLElement>("button, select, textarea, input[type='text']")
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if ((el as HTMLButtonElement).disabled) return;
        if (el.closest('[hidden]')) return;
        const cs = getComputedStyle(el);
        const outside = backdrop(el.parentElement);
        const fillRaw = parse(cs.backgroundColor);
        const fill = fillRaw.a > 0 ? over(fillRaw, outside) : outside;
        const byFill = ratio(fill, outside);
        let byBorder = 1;
        if (parseFloat(cs.borderTopWidth) > 0) {
          const border = over(parse(cs.borderTopColor), fill);
          byBorder = Math.min(ratio(border, outside), ratio(border, fill));
        }
        out.push({
          sel: describe(el),
          ratio: Math.round(Math.max(byFill, byBorder) * 100) / 100,
        });
      });
    return out;
  });
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run. It
 * is a debugging aid only: `A11Y_COLLECT` is never set in CI or in the committed
 * workflow, and a run with it set prints every finding as it happens and then
 * fails at the end, so a green collection run cannot be mistaken for a green
 * gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function expectScrollersReachableSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectScrollersReachable(page, label);
  try {
    await expectScrollersReachable(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

async function expectNoHorizontalOverflowSoft(page: Page, label: string): Promise<void> {
  if (!COLLECTING) return expectNoHorizontalOverflow(page, label);
  try {
    await expectNoHorizontalOverflow(page, label);
  } catch (e) {
    record(String(e).slice(0, 900));
  }
}

/**
 * Scan the page as it currently stands.
 *
 * Seven assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those ratios
 *    arithmetically — which matters more here than in most labs, since all three
 *    verdict surfaces are `color-mix(in oklab, …)` that axe declines to resolve.
 *    Everything else in that bucket is a real result axe simply could not finish
 *    — including `aria-prohibited-attr`, which is where an `aria-label` on a
 *    role-less element hides, a defect that never reaches the violations array
 *    at all. That one is live here: `dom.ts`'s `scroller()` puts an `aria-label`
 *    on a `<div>` and makes it legal with `role="region"`, and the role is easy
 *    to drop by accident.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - non-text contrast for interactive controls — SC 1.4.11, which axe has no
 *    rule for; see `auditControlBoundaries`.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // These four are axe "best-practice" rules rather than WCAG-tagged ones, so
    // `withTags` alone does not run them. This page has a shared sticky
    // <header role="banner"> above a <main> that contains a second <header>, and
    // the hero's <aside role="complementary"> inside it — exactly the shape they
    // catch, and none of them was enabled before.
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  const boundaries = await auditControlBoundaries(page);
  expect(boundaries.length, `no controls found to measure in state: ${label}`).toBeGreaterThan(0);
  const undelineated = Array.from(
    new Set(boundaries.filter((b) => b.ratio < 3).map((b) => `${b.ratio}:1 ${b.sel}`))
  );
  softExpect(undelineated, `control boundaries under 3:1 (SC 1.4.11) in state: ${label}`, []);

  await expectScrollersReachableSoft(page, label);
  await expectNoHorizontalOverflowSoft(page, label);
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Open one `<details>` the way a reader does, and assert it opened. */
async function openDisclosure(page: Page, summaryText: string | RegExp): Promise<void> {
  const summary = page.locator('details > summary').filter({ hasText: summaryText }).first();
  await summary.click();
  await expect(summary.locator('..')).toHaveAttribute('open', '');
}

/**
 * Open every disclosure currently on the page that is not already open.
 *
 * This is NOT the old gate's `openEverything()`. That one set `d.open = true`
 * over `querySelectorAll('details')` and — the part that mattered — also
 * stripped `[hidden]`, which is the guided route's entire mechanism. This clicks
 * each `<summary>`, which is the route a reader has, touches nothing else, and
 * is called at points in the drive where the SHUT state has already been
 * scanned.
 *
 * It has to iterate rather than take a static list because the set is
 * state-dependent: `dom.ts`'s `layered()` mints a disclosure inside every
 * verdict, so a panel that has not produced a verdict yet has none, and
 * `#def-out`'s "Those last two numbers are identical" one exists under the
 * Laplace mechanism and vanishes under the Gaussian.
 */
async function openAllDisclosures(page: Page): Promise<number> {
  // `:visible` matters and is not a convenience. On the guided route five
  // panels are `hidden`, and the disclosures inside them — the guessing
  // experiment's sample summary, the deployments chart's data table, the
  // composition crossover's, post-processing's — are in the DOM, shut, and
  // unclickable. Reaching for them would hang on an element no reader can see,
  // and forcing them open from script is exactly what the gate this replaces
  // did. They are opened on the explore route instead, where they exist.
  const shut = page.locator('details:not([open]) > summary:visible');
  let opened = 0;
  for (let i = await shut.count(); i > 0; i = await shut.count()) {
    await shut.first().click();
    opened += 1;
    // A disclosure whose click does not open it would spin here forever; the
    // count must strictly fall, so cap the loop rather than trust it.
    if (opened > 80) break;
  }
  expect(opened, 'a state with no shut disclosures left to open is suspicious').toBeGreaterThan(0);
  await expect(page.locator('details:not([open]) > summary:visible')).toHaveCount(0);
  return opened;
}

/** Switch route with the chooser, and assert the five expert panels followed. */
async function chooseRoute(page: Page, route: 'guided' | 'explore'): Promise<void> {
  const label = route === 'guided' ? 'Guided lesson' : 'Explore everything';
  await page.locator('.path__route').filter({ hasText: label }).click();
  await expect(page.locator('#app')).toHaveAttribute('data-route', route);
  for (const { sel } of EXPERT_PANELS) {
    if (route === 'guided') await expect(page.locator(sel)).toBeHidden();
    else await expect(page.locator(sel)).toBeVisible();
  }
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Seven things shape this drive:
 *
 *  - BOTH ROUTES ARE DRIVEN, GUIDED FIRST AND WITH CONTENT IN IT. The guided
 *    route is what the page ships, and it is a genuinely different document:
 *    five panels removed with `hidden`, and Exhibit 5's three cards physically
 *    re-appended so the averaging attack comes BEFORE the ledger. The gate this
 *    replaces stripped `[hidden]` before every scan, so it never measured the
 *    guided route at all — and it scanned a hybrid document, with both routes'
 *    content on screen at once, that no visitor can load.
 *
 *  - THE REORDER IS ASSERTED, NOT ASSUMED. `applyGuidedOrder()` moves real DOM
 *    nodes rather than setting CSS `order`, precisely so reading and focus order
 *    follow the visual order (WCAG 1.3.2 / 2.4.3). That is a claim about the
 *    DOM, so the drive reads the DOM order back on both routes.
 *
 *  - EVERY VERDICT TONE, INCLUDING THE REFUSALS. `--ok`, `--bad`, `--warn` and
 *    `--idle` each get scanned, and the two REFUSALS especially: the budget
 *    ledger declining a query it cannot cover, and the bounded-sensitivity
 *    panel declining to calibrate Δ from the data. Those are the only two places
 *    the page answers a chosen option with "no", and both are `--bad` on a
 *    `color-mix()` surface no oracle had ever measured.
 *
 *  - THE PREREQUISITE STATES BEFORE THE UNLOCK. `#guess-yes`/`#guess-no` ship
 *    `disabled` and are enabled only by dealing a release; the ledger's
 *    "exhausted" meter is a different rendering from the refusal that follows
 *    it; and `#exit-readiness` prints a different sentence for each of the five
 *    counts of unfinished core interactions.
 *
 *  - COMPUTED-BOUNDARY STATES. Three renderings exist only when a computed value
 *    crosses a line, and each takes a specific configuration: the lattice
 *    disclosure (`sum-salary` on a discrete mechanism), the "over budget — would
 *    be refused" quote in the linked readout (ε at index 10 or above), and the
 *    negative-release note (ε at index 0).
 *
 *  - DISCLOSURES ARE OPENED BY THEIR SUMMARIES, and only after the shut state
 *    has been scanned. Every chart's data table — which is the accessible form
 *    of a figure the SVG marks `aria-hidden` — lives inside one, and each of
 *    those tables is itself a `role="region"` scroller.
 *
 *  - NO FIXED TIMEOUTS. The two chunked samplers (2,000 histogram draws, and the
 *    averaging attack) are the only slow things here, and under the reduced
 *    motion this gate asserts they run synchronously. The drive still waits on
 *    their real completion signals — the button re-enabling and the verdict
 *    appearing — rather than on a duration.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  // ── The guided route, exactly as the page ships ──────────────────────────
  await scanAt('guided route, first paint, nothing established');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('guided route, skip link focused');

  // Exhibit 5's cards are physically re-ordered on this route: attack, then
  // ledger. Reading the DOM back is the only way that claim is checked.
  const orderOf = async (): Promise<string[]> =>
    page.$$eval('#budget > .card', (cards) =>
      cards.map((c) => c.querySelector('h3')?.textContent?.trim() ?? '?')
    );
  expect(await orderOf(), 'guided order puts the attack before the ledger').toEqual([
    'The averaging attack — what happens with no budget at all',
    'The ledger',
    'Two ways to add up privacy loss',
  ]);

  await openDisclosure(page, 'Jargon, unpacked');
  await scanAt('guided route, jargon glossary open');

  await page.check('#seed-toggle');
  await expect(page.locator('#teaching-mode .note')).toContainText('Reproducible classroom run');
  await scanAt('classroom mode on, seeded sampling');
  await page.uncheck('#seed-toggle');
  await expect(page.locator('#teaching-mode .note')).toContainText('Live cryptographic randomness');
  await scanAt('classroom mode off, live randomness');

  // ── The three prediction checks that exist on the guided route ───────────
  // Wrong first, so the `--bad` "Not quite" rendering is measured, then right.
  for (const id of ['pr-epsilon', 'pr-aggregate', 'pr-repeat']) {
    await page.click(`#${id}-0`);
    await expect(page.locator(`#${id} .verdict--bad`)).toContainText('Not quite');
    await scanAt(`prediction ${id} answered wrong`);
    await page.click(`#${id}-1`);
    await expect(page.locator(`#${id} .verdict--ok`)).toContainText('Correct');
  }
  await scanAt('all three guided prediction checks correct');

  // ── Exhibit 1: the differencing attack ───────────────────────────────────
  await expect(page.locator('#leak-out .verdict--idle')).toContainText('Nothing run yet');
  await page.click('#leak-run');
  await expect(page.locator('#leak-out .verdict--bad')).toContainText(
    "Alice's salary recovered exactly: $142,000"
  );
  await expect(page.locator('#path .path__progress')).toHaveText(/^1 of 4/);
  await scanAt('exact answers recovered Alice exactly');

  await page.selectOption('#leak-mode', 'dp');
  await expect(page.locator('#leak-out .verdict--ok')).toContainText('Attack failed');
  await scanAt('the same attack under differential privacy fails');

  // ── Exhibit 2: the definition ────────────────────────────────────────────
  await expect(page.locator('#def-guarantee .verdict--ok')).toContainText('The rails hold');
  await page.locator('#def-eps').fill('0');
  await expect(page.locator('#def-eps-value')).toHaveText('0.01');
  await expect(page.locator('#path .path__progress')).toHaveText(/^2 of 4/);
  await scanAt('epsilon at its floor, the two worlds coincide');

  await page.locator('#def-eps').fill('14');
  await expect(page.locator('#def-eps-value')).toHaveText('10');
  await scanAt('epsilon at its ceiling, the two worlds separate');

  await page.locator('#def-eps').fill('8');
  await page.selectOption('#def-mech', 'gaussian');
  await expect(page.locator('#def-guarantee .verdict--warn')).toContainText(
    'The rails do not hold — this is why δ exists'
  );
  // The Laplace-only disclosure must be GONE under the Gaussian.
  await expect(
    page.locator('details > summary').filter({ hasText: 'Those last two numbers are identical' })
  ).toHaveCount(0);
  await scanAt('the Gaussian sails through the rails, which is why delta exists');

  await page.selectOption('#def-mech', 'laplace');
  await expect(page.locator('#def-guarantee .verdict--ok')).toBeVisible();
  await scanAt('back to the Laplace mechanism, rails tight again');

  // ── Exhibit 4: the dial. Every mechanism, and the query that moves Δ ─────
  await expect(page.locator('#dial-release-out .verdict--idle')).toContainText(
    'No answer released yet'
  );
  await page.click('#dial-release');
  await expect(page.locator('#dial-release-out .chip')).toHaveCount(6);
  await scanAt('six independent releases of the same question');

  await page.selectOption('#dial-mech', 'discrete-gaussian');
  await page.click('#dial-release');
  await expect(page.locator('#dial-release-out .chip')).toHaveCount(6);
  await scanAt('the discrete Gaussian mechanism');

  await page.selectOption('#dial-mech', 'continuous-laplace');
  await expect(page.locator('#dial-out .verdict--warn')).toContainText(
    'Textbook mode — this is the sampler Mironov broke'
  );
  await scanAt('the textbook float sampler, labelled as broken');

  await page.selectOption('#dial-mech', 'exact');
  await expect(page.locator('#dial-out .verdict--bad')).toContainText(
    'No privacy at all — this is the broken mode'
  );
  await page.click('#dial-release');
  await scanAt('no noise at all, the broken mode');

  // sum-salary is the only query with a different Δ, so it is the only one that
  // establishes the sensitivity idea — and, on a discrete mechanism, the only
  // configuration that renders the lattice disclosure.
  await page.selectOption('#dial-mech', 'discrete-laplace');
  await page.selectOption('#dial-query', 'sum-salary');
  await expect(page.locator('#path .path__progress')).toHaveText(/^3 of 4/);
  await openDisclosure(page, /released on a \$5,000 lattice/);
  await scanAt('the total payroll on a lattice, the approximation disclosed');

  // ε at its floor makes a negative release essentially certain, which is its
  // own rendering and its own sentence.
  await page.selectOption('#dial-query', 'count-high');
  await page.locator('#dial-eps').fill('0');
  await page.click('#dial-release');
  await expect(page.locator('#dial-release-out .chip')).toHaveCount(6);
  await scanAt('releases at the smallest epsilon, some of them negative');

  // ε past the budget flips the linked readout's quote into "would be refused".
  await page.locator('#dial-eps').fill('10');
  await expect(page.locator('.readout').first()).toContainText('over budget — would be refused');
  await scanAt('one release would now be refused, quoted in the linked readout');
  await page.locator('#dial-eps').fill('8');

  // ── Exhibit 4b: bounded sensitivity, every bound and all three decisions ──
  await expect(page.locator('#bound-decision-out .verdict--idle')).toBeVisible();
  for (const hi of ['100000', '150000', '500000', '250000']) {
    await page.selectOption('#bound-hi', hi);
    await expect(page.locator('#bound-out .stat').first()).toBeVisible();
    await scanAt(`declared upper bound $${hi}`);
  }
  await page.click('#bound-clip');
  await expect(page.locator('#bound-decision-out .verdict--ok')).toContainText(
    'Private, and biased by a known amount'
  );
  await scanAt('the out-of-range record clipped');
  await page.click('#bound-reject');
  await expect(page.locator('#bound-decision-out .verdict--warn')).toContainText(
    'you are now answering a different question'
  );
  await scanAt('the out-of-range record dropped');
  // The refusal: the only place the page answers a chosen option with "no".
  await page.click('#bound-expand');
  await expect(page.locator('#bound-decision-out .verdict--bad')).toContainText(
    'Refused — this is not a private calibration'
  );
  await expect(page.locator('#bound-decision-out .stat-row')).toHaveCount(0);
  await scanAt('raising the bound to fit her is REFUSED, not offered');

  // ── Exhibit 5: the ledger to exhaustion, then past it ────────────────────
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');
  await page.click('#ask-sum');
  await expect(page.locator('#bud-out .verdict--ok')).toContainText('Answered');
  await scanAt('one question answered and charged');
  await page.click('#ask-sum');
  await page.click('#ask-sum');
  await expect(page.locator('.meter__fill--full')).toBeVisible();
  await expect(page.locator('#bud-ledger .meter__caption')).toContainText('exhausted');
  await scanAt('the budget exactly exhausted, still answered');
  await page.click('#ask-count');
  await expect(page.locator('#bud-out .verdict--bad')).toContainText(
    'Refused — the budget cannot cover this query'
  );
  await scanAt('the ledger REFUSES a query it cannot cover');

  await page.click('#bud-reset');
  await expect(page.locator('#bud-ledger tbody td.muted')).toContainText('Nothing released yet.');
  await scanAt('ledger reset to empty');
  await page.selectOption('#bud-budget', '10');
  await page.click('#ask-head');
  await expect(page.locator('#bud-out .verdict--ok')).toContainText('Answered');
  await scanAt('a generous budget, comfortably answered');

  // The averaging attack. Under reduced motion `chunked()` is synchronous, so
  // the completion signal is the button re-enabling and the verdict landing —
  // both real, neither a duration.
  await page.locator('#avg-n').fill('200');
  await page.click('#avg-run');
  await expect(page.locator('#avg-out .verdict--bad strong')).toHaveText(
    /^The true payroll is recovered to within \$/
  );
  await expect(page.locator('#avg-run')).toBeEnabled();
  await expect(page.locator('#path .path__progress')).toHaveText(/^4 of 4/);
  await scanAt('the averaging attack recovers the true payroll');

  await expect(page.locator('.path__done')).toContainText('All four established.');
  await scanAt('the navigator with all four ideas established');

  await openAllDisclosures(page);
  await scanAt('guided route, every disclosure open');

  // ── Switch to Explore: five panels return, and the order changes back ────
  await chooseRoute(page, 'explore');
  expect(await orderOf(), 'explore order restores the reference sequence').toEqual([
    'The ledger',
    'Two ways to add up privacy loss',
    'The averaging attack — what happens with no budget at all',
  ]);
  // The route chooser also turns linking OFF, which is a different readout.
  await expect(page.locator('#link-toggle')).not.toBeChecked();
  await expect(page.locator('.readout').first()).toContainText('this exhibit only');
  await scanAt('explore route, every panel present and linking off');

  await page.check('#link-toggle');
  await expect(page.locator('.readout').first()).toContainText('linked across exhibits');
  await scanAt('explore route with linking back on');

  // ── Expert material the guided route had set aside ───────────────────────
  await page.click('#pr-anon-0');
  await expect(page.locator('#pr-anon .verdict--bad')).toContainText('Not quite');
  await scanAt('the anonymisation prediction answered wrong');
  await page.click('#pr-anon-1');
  await expect(page.locator('#pr-anon .verdict--ok')).toContainText('Correct');

  for (const level of ['raw', 'age-banded', 'k6', 'k3']) {
    await page.selectOption('#kanon-level', level);
    await expect(page.locator('#kanon-out .verdict')).toContainText('anonymous');
    await scanAt(`k-anonymity at generalisation "${level}"`);
  }

  await page.click('#dial-mean');
  await expect(page.locator('#dial-mean-out .verdict--ok')).toContainText('the division was free');
  await scanAt('post-processing is free');

  await expect(page.locator('#bud-composition .chart')).toBeVisible();
  await expect(page.locator('#dep-table .data-table')).toBeVisible();
  await expect(page.locator('#dep-census .stat')).not.toHaveCount(0);
  await scanAt('the composition crossover and the deployments panel');

  // ── Exhibit 3: the guessing experiment, and its disabled prerequisite ────
  await expect(page.locator('#guess-chart .verdict--idle')).toContainText('No samples drawn yet');
  await expect(page.locator('#guess-yes')).toBeDisabled();
  await expect(page.locator('#guess-no')).toBeDisabled();
  await scanAt('the guessing game locked until a release is dealt');

  await page.click('#guess-sample');
  await expect(page.locator('#guess-sample-out .verdict strong')).toHaveText(
    /^Sampled and predicted agree to /
  );
  await expect(page.locator('#guess-sample')).toBeEnabled();
  await scanAt('two thousand real releases drawn from each world');

  await page.click('#guess-deal');
  await expect(page.locator('#guess-out .deal__value')).toBeVisible();
  await expect(page.locator('#guess-yes')).toBeEnabled();
  await scanAt('a release dealt, the guess buttons unlocked');

  await page.click('#guess-yes');
  await expect(page.locator('#guess-out .verdict strong')).toHaveText(/^(Right|Wrong)$/);
  await expect(page.locator('#guess-yes')).toBeDisabled();
  await scanAt('one round answered, the buttons locked again');

  // Ten completed rounds is the threshold past which the page starts commenting
  // on the score, which is its own verdict and its own tone.
  for (let i = 1; i < 10; i++) {
    await page.click('#guess-deal');
    await expect(page.locator('#guess-out .deal__value')).toBeVisible();
    await page.click(i % 2 === 0 ? '#guess-yes' : '#guess-no');
  }
  await expect(page.locator('#guess-out .verdict').last()).toBeVisible();
  await scanAt('ten rounds played, the page comments on the score');

  await page.click('#guess-reset');
  await expect(page.locator('#guess-out .verdict--idle')).toContainText('Deal a release to start');
  await scanAt('the guessing score reset');

  // ── The exit challenge ───────────────────────────────────────────────────
  await expect(page.locator('#exit-readiness .note')).toContainText(
    'All four core interactions have been run'
  );
  await expect(page.locator('#exit-result .verdict--idle')).toContainText(
    'Four scenarios, none of them from this page'
  );

  // A wrong answer first, so the "revisit this" verdict and its pointer link are
  // scanned. `x-sensitivity` rather than `x-anonymisation`, because the latter's
  // revisit link SWITCHES THE ROUTE when followed and would tear the page down
  // underneath the rest of the drive.
  await page.click('#x-sensitivity-0');
  await expect(page.locator('#exit-result .verdict--warn strong').first()).toHaveText(/to revisit$/);
  // The ids live on the option BUTTONS, not on the question wrapper, so the
  // wrapper is reached through one of its buttons.
  const sensitivityQ = page.locator('.exit__q').filter({ has: page.locator('#x-sensitivity-0') });
  await expect(sensitivityQ.locator('.exit__revisit')).toContainText('Go and run this:');
  await expect(sensitivityQ.locator('.exit__revisit a')).toHaveAttribute('href', '#dial');
  await scanAt('an exit question answered wrong, with its revisit pointer');

  await page.click('#x-sensitivity-1');
  await expect(page.locator('#exit-result .verdict--idle strong').first()).toHaveText(
    /to go — nothing to revisit so far$/
  );
  await scanAt('corrected, three still to go');

  await page.click('#x-composition-0');
  await page.click('#x-anonymisation-2');
  await page.click('#x-delta-1');
  await expect(page.locator('#exit-result .verdict--ok')).toContainText('All four transferred');
  await scanAt('all four exit scenarios transferred');

  await openAllDisclosures(page);
  await scanAt('explore route, the finished page with every disclosure open');
}
