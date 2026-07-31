/**
 * The core path: persistent orientation, not a tour.
 *
 * The page has always contained enough material for a short advanced workshop
 * and presented all of it at equal weight, which is excellent as a reference and
 * expensive as a first lesson. This navigator is the instructional spine: four
 * ideas, the one interaction that establishes each, and a live record of which
 * ones the reader has actually done.
 *
 * Three deliberate non-features, because the failure mode here is a tutorial
 * that fights the interface:
 *
 * - **No modal, no overlay, no forced sequence.** It is a block of the document
 *   that you can ignore, and every exhibit stays reachable from it in any order.
 * - **No badges, no points, no streak.** A step reads "established" or it does
 *   not. There is nothing to collect.
 * - **Completion is earned by the interaction.** Each exhibit calls
 *   `complete()` from inside the handler that did the work, so scrolling past a
 *   section never ticks it off.
 *
 * The route toggle is the progressive disclosure. On the guided route the
 * expert panels — the guessing experiment, the composition chart, the
 * deployments, k-anonymity, post-processing — are removed from the page rather
 * than merely de-emphasised, and the navigator says in plain text what is being
 * withheld and how to get it. The honest-scoping section is never hidden on
 * either route: staging rigor is a teaching decision, and concealing the
 * limitations would be a different and worse thing.
 */
import { CURRICULUM, type Unit } from './curriculum';
import { byId, clear, el } from './dom';
import { complete, coreProgress, getState, subscribe, update } from './state';

/** What the guided route sets aside, named so nothing looks concealed. */
const EXPERT_MATERIAL =
  'k-anonymity and the homogeneity attack, the guessing experiment, the composition rules and their crossover, ' +
  'post-processing, and the deployment accounting for Apple, RAPPOR and the 2020 Census';

export function initPath(): void {
  stampNaturalOrder();
  wireRouteEffects();
  render();
  subscribe(render);
}

/**
 * Record where every reorderable node started, once, before anything moves it.
 * Without this the "natural" order would be read back out of a DOM that has
 * already been rearranged, and switching routes twice would scramble the page.
 */
function stampNaturalOrder(): void {
  document.querySelectorAll<HTMLElement>('[data-reorder]').forEach((container) => {
    Array.from(container.children).forEach((node, i) => {
      (node as HTMLElement).dataset.orderNatural = String(i);
    });
  });
}

/**
 * Put the attack before the defence, on the guided route only.
 *
 * Exhibit 5 contains both the averaging attack and the ledger that prevents it,
 * and in reference order the ledger comes first — which asks a newcomer to
 * understand composition accounting before they have seen why anyone would want
 * it. Guided order runs the attack first, so the budget arrives as the answer to
 * a problem the reader has already watched happen.
 *
 * This moves real DOM nodes rather than setting CSS `order`. Flexbox ordering
 * changes the visual sequence and leaves the reading and focus sequence where
 * they were, which puts a keyboard or screen-reader user through the panels in
 * an order nobody chose — WCAG 1.3.2 and 2.4.3, and the exact failure this
 * page's accessibility work exists to avoid.
 */
function applyGuidedOrder(): void {
  const guided = getState().route === 'guided';
  document.querySelectorAll<HTMLElement>('[data-reorder]').forEach((container) => {
    const kids = Array.from(container.children) as HTMLElement[];
    const key = (node: HTMLElement): number => {
      const natural = Number(node.dataset.orderNatural ?? 0);
      return guided ? Number(node.dataset.orderGuided ?? natural) : natural;
    };
    // A stable sort on the chosen key, then re-append in that order: appending
    // an existing child moves it, so the container is never emptied and no
    // element is destroyed and recreated.
    for (const node of [...kids].sort((a, b) => key(a) - key(b))) container.append(node);
  });
}

/**
 * Guided route removes the expert panels outright. `hidden` rather than a CSS
 * class so that the element is gone for assistive technology and for keyboard
 * order too — a panel that is merely dimmed is still a dozen Tab stops between
 * a reader and the next core step.
 */
function wireRouteEffects(): void {
  const apply = (): void => {
    const guided = getState().route === 'guided';
    document.querySelectorAll<HTMLElement>('[data-depth="expert"]').forEach((node) => {
      node.toggleAttribute('hidden', guided);
    });
    byId('app').dataset.route = getState().route;
    applyGuidedOrder();
  };
  apply();
  subscribe((next, prev) => {
    if (next.route !== prev.route) apply();
  });
}

function render(): void {
  const state = getState();
  const { done, total, allDone } = coreProgress();
  const mount = byId('path');
  clear(mount);

  const nav = el('nav', { class: 'path', 'aria-labelledby': 'path-h' }, [
    el('div', { class: 'path__head' }, [
      el('p', { class: 'kicker', id: 'path-h', text: 'The core path' }),
      el('p', {
        class: 'path__progress',
        role: 'status',
        text: `${done} of ${total} core ideas established${allDone ? ' — all four done' : ''}`,
      }),
    ]),
    routeChooser(state.route),
    el(
      'ol',
      { class: 'path__steps' },
      // Exactly one step is "next": the first not yet established. Priority 1's
      // acceptance test is that a first-time reader can identify the next
      // meaningful action *without reading the whole section*, and four
      // identically-weighted steps do not do that however good each one is.
      CURRICULUM.map((unit, i) =>
        stepItem(unit, i, state.completed.has(unit.id), unit.id === nextStep()),
      ),
    ),
  ]);

  if (state.route === 'guided') {
    nav.append(
      el('p', { class: 'note path__withheld' }, [
        el('strong', { text: 'Set aside on this route: ' }),
        document.createTextNode(
          `${EXPERT_MATERIAL}. None of it is cut and none of it contradicts the four ideas above — switch to ` +
            `“Explore everything” to read it. The honest-scoping section at the foot of the page stays visible on ` +
            `both routes.`,
        ),
      ]),
    );
  }

  nav.append(
    allDone
      ? el('p', { class: 'path__done' }, [
          el('strong', { text: 'All four established. ' }),
          document.createTextNode('The exit challenge applies them to four situations this page has not shown you — '),
          el('a', { href: '#exit', text: 'take it now' }),
          document.createTextNode('.'),
        ])
      : el('p', {
          class: 'path__hint',
          text:
            'Each step is marked established only once you have run its interaction. Working out of order is fine; ' +
            'the page does not gate anything.',
        }),
  );

  // Re-created on every navigator render, then filled by `initLink`, which
  // subscribes after this module does and so always runs second.
  mount.append(nav, el('div', { id: 'path-readout', 'data-readout': 'primary' }));
}

function routeChooser(route: string): HTMLElement {
  const group = el('div', { class: 'path__routes', role: 'group', 'aria-label': 'Choose a route through the lab' });
  const options: { id: 'guided' | 'explore'; label: string; note: string }[] = [
    { id: 'guided', label: 'Guided lesson', note: 'the four core ideas, about 12–15 minutes' },
    { id: 'explore', label: 'Explore everything', note: 'every exhibit, every caveat, no ordering' },
  ];
  for (const o of options) {
    const on = route === o.id;
    const btn = el('button', { class: 'path__route', type: 'button', 'aria-pressed': String(on) }, [
      el('span', { class: 'path__route-label', text: o.label }),
      el('span', { class: 'path__route-note', text: o.note }),
    ]);
    // Linking is the default on the guided route because the whole point there
    // is that ε, sensitivity and budget are one system; on the explore route the
    // reader is more likely to want two exhibits parked at different ε.
    btn.addEventListener('click', () => update({ route: o.id, linked: o.id === 'guided' }));
    group.append(btn);
  }
  return group;
}

/** The first idea not yet established, or null once all four are. */
function nextStep(): string | null {
  return CURRICULUM.find((u) => !getState().completed.has(u.id))?.id ?? null;
}

function stepItem(unit: Unit, index: number, done: boolean, isNext: boolean): HTMLElement {
  const classes = ['path__step', done ? 'path__step--done' : '', isNext ? 'path__step--next' : '']
    .filter(Boolean)
    .join(' ');

  const idea = el('p', { class: 'path__idea' }, [
    el('a', { href: unit.href, text: unit.idea }),
    el('span', { class: 'path__exhibit', text: unit.exhibit }),
  ]);
  // "Next" is a word before it is a border colour, because a reader in
  // greyscale, or one who cannot distinguish the accent from the ok colour,
  // needs the same one-glance answer as everyone else.
  if (isNext) idea.append(el('span', { class: 'path__next-tag', text: 'Start here' }));

  return el('li', { class: classes }, [
    el('span', {
      class: 'path__mark',
      'aria-hidden': 'true',
      text: done ? '✓' : String(index + 1),
    }),
    el('div', { class: 'path__body' }, [
      idea,
      el('p', { class: 'path__action' }, [
        el('span', { class: 'path__action-label', text: 'Do: ' }),
        document.createTextNode(unit.action),
      ]),
      el('p', { class: 'path__establishes', text: unit.establishes }),
      el('p', { class: 'path__status', text: done ? 'Established' : 'Not yet established' }),
      // Closes the loop the objectives opened: this is the idea, this is what
      // establishes it, and this is where it gets tested on a situation the
      // page has not shown you.
      el('p', { class: 'path__tested' }, [
        document.createTextNode('Tested by: '),
        el('a', { href: '#exit', text: `the exit challenge on ${unit.conceptInline}` }),
      ]),
    ]),
  ]);
}

/** Re-exported so exhibits mark their own step without importing the store. */
export { complete };
