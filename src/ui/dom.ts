/** Small DOM helpers shared by the exhibits. No framework, no dependencies. */

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node as T;
}

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  for (const child of children) node.append(child);
  return node;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Array<Node | string> = [],
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  applyAttrs(node, attrs);
  for (const child of children) node.append(child);
  return node;
}

function applyAttrs(node: Element, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'class') node.setAttribute('class', String(value));
    else if (key === 'text') node.textContent = String(value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
}

export function clear(node: Element): void {
  node.replaceChildren();
}

export type VerdictKind = 'ok' | 'bad' | 'warn' | 'idle';

const VERDICT_ICON: Record<VerdictKind, string> = { ok: '✓', bad: '✗', warn: '!', idle: '·' };

/**
 * A status block that never relies on colour alone: an icon, a worded headline
 * and a colour, in that order of importance.
 *
 * Colour here tracks *system integrity*, not the return value. An attack that
 * succeeds is a `bad` verdict even though the attacker would call it a success.
 */
export function verdict(kind: VerdictKind, headline: string, detail?: string | Node): HTMLElement {
  const body = el('div', { class: 'verdict__body' }, [el('strong', { text: headline })]);
  if (typeof detail === 'string') body.append(el('p', { text: detail }));
  else if (detail) body.append(detail);
  return el('div', { class: `verdict verdict--${kind}` }, [
    el('span', { class: 'verdict__icon', 'aria-hidden': 'true', text: VERDICT_ICON[kind] }),
    body,
  ]);
}

/**
 * The three-layer readout this page uses after an interaction.
 *
 * The rigor was never the problem; the *simultaneity* was. A verdict that opens
 * with continuous-versus-discrete calibration, the lattice shift and a paper
 * citation is correct and unreadable to the person the sentence is for. So each
 * one is staged:
 *
 * - **Observation** — one sentence naming what just changed on screen.
 * - **Meaning** — one or two sentences tying it to the thing being taught.
 * - **Why the details matter** — a disclosure holding the exact formulas, the
 *   calibration caveats and the citations.
 *
 * The disclosure's label always says a caveat is *there*, never that there
 * isn't one. Staging rigor behind a click is a teaching decision; hiding it
 * would be a dishonest one, and this page's whole claim is that it does not do
 * that.
 */
export interface Layers {
  readonly observation: string;
  readonly meaning: string;
  readonly details?: readonly (string | Node)[];
  /** Overrides the disclosure label when the caveat has a specific name. */
  readonly detailsLabel?: string;
}

export function layered(kind: VerdictKind, headline: string, layers: Layers): HTMLElement {
  const body = el('div', { class: 'layered' }, [
    el('p', { class: 'layered__observation', text: layers.observation }),
    el('p', { class: 'layered__meaning', text: layers.meaning }),
  ]);
  if (layers.details?.length) {
    body.append(
      el('details', { class: 'layered__more' }, [
        el('summary', {
          text: layers.detailsLabel ?? 'Why the details matter — the exact accounting, and the caveats it carries',
        }),
        ...layers.details.map((d) => (typeof d === 'string' ? el('p', { text: d }) : d)),
      ]),
    );
  }
  return verdict(kind, headline, body);
}

/**
 * One labelled number, as a dt/dd pair inside the single `div` a `<dl>` is
 * allowed to wrap a group in. The note goes *inside* the `dd` — a sibling
 * paragraph would be a third element in that group, which is invalid list
 * markup and which axe rightly refuses.
 */
export function stat(label: string, value: string, note?: string): HTMLElement {
  const dd = el('dd', {}, [document.createTextNode(value)]);
  if (note) dd.append(el('span', { class: 'stat__note', text: note }));
  return el('div', { class: 'stat' }, [el('dt', { text: label }), dd]);
}

export function statRow(stats: HTMLElement[], label?: string): HTMLElement {
  return el('dl', { class: 'stat-row', ...(label ? { 'aria-label': label } : {}) }, stats);
}

/**
 * An in-page link that can also widen the route it is pointing into.
 *
 * Some of the page is set aside on the guided route, and some pointers — a
 * "revisit this" after a wrong challenge answer, most of all — target exactly
 * that material. A link to a section the reader's route has removed is the worst
 * kind of broken pointer: it scrolls somewhere plausible and the thing is not
 * there. `onFollow` runs before the jump so the link can switch the route first.
 *
 * The label says so too. Silently changing what is on someone's page is not
 * better than a dead link, merely quieter.
 */
export function jumpLink(
  href: string,
  text: string,
  opts: { onFollow?: () => void; note?: string } = {},
): HTMLElement {
  const link = el('a', { href, text });
  if (opts.onFollow) link.addEventListener('click', opts.onFollow);
  if (!opts.note) return link;
  const wrap = el('span', {}, [link, el('span', { class: 'jump__note', text: ` ${opts.note}` })]);
  return wrap;
}

/** Wraps wide content so it scrolls on its own and stays keyboard reachable. */
export function scroller(label: string, child: Node): HTMLElement {
  return el('div', { class: 'scroller', role: 'region', tabindex: '0', 'aria-label': label }, [child]);
}

export const money = (n: number): string =>
  (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');

export const num = (n: number, dp = 0): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * A percentage, refusing to round a near-certainty up to a flat "100%".
 * At ε = 17 an attacker's belief really can reach 99.999997%, and printing that
 * as 100% would quietly turn a bound into an absolute.
 */
export const pct = (p: number, dp = 1): string => {
  if (p > 1 - Math.pow(10, -(dp + 2))) return `> ${(100 - Math.pow(10, -dp)).toFixed(dp)}%`;
  if (p > 0 && p < Math.pow(10, -(dp + 2))) return `< ${Math.pow(10, -dp).toFixed(dp)}%`;
  return `${(p * 100).toFixed(dp)}%`;
};

/** Money short enough for a chart axis: $1.2M, $250k, $400. */
export function compactMoney(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** e^ε and friends run over several orders of magnitude; keep them readable. */
export function ratio(r: number): string {
  if (!Number.isFinite(r)) return '∞';
  if (r >= 1e6) return r.toExponential(2).replace('e+', ' × 10^');
  if (r >= 100) return r.toFixed(0);
  if (r >= 10) return r.toFixed(1);
  return r.toFixed(2);
}

export function signed(n: number, fmt: (v: number) => string = (v) => num(v)): string {
  return n > 0 ? `+${fmt(n)}` : fmt(n);
}

/** True when the reader has asked the OS for less motion. */
export function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Runs `work` in chunks across animation frames so a few thousand exact
 * samples do not freeze the page, and so the reader watches the histogram
 * build rather than seeing it appear. The motion is the computation — there is
 * no decorative animation anywhere on this page.
 */
export function chunked(
  total: number,
  perFrame: number,
  work: (from: number, to: number) => void,
  done: () => void,
): void {
  if (reducedMotion()) {
    work(0, total);
    done();
    return;
  }
  let at = 0;
  const step = (): void => {
    const to = Math.min(total, at + perFrame);
    work(at, to);
    at = to;
    if (at < total) requestAnimationFrame(step);
    else done();
  };
  requestAnimationFrame(step);
}
